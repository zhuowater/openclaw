'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');
const tls = require('tls');

const SECURITY_HEADERS = [
  'strict-transport-security',
  'content-security-policy',
  'x-frame-options',
  'x-content-type-options',
  'x-xss-protection',
  'referrer-policy',
  'permissions-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
  'cross-origin-embedder-policy',
];

/**
 * Probe a single HTTP endpoint.
 * @param {string} url - The URL to probe
 * @param {object} [opts] - Options
 * @param {number} [opts.timeout=10000] - Timeout in ms
 * @param {boolean} [opts.followRedirects=true] - Follow redirects
 * @param {number} [opts.maxRedirects=10] - Max redirect hops
 * @returns {Promise<object>} Probe result
 */
async function probe(url, opts = {}) {
  const timeout = opts.timeout || 10000;
  const maxRedirects = opts.maxRedirects || 10;
  const redirects = [];
  let currentUrl = url;
  let hops = 0;

  while (hops < maxRedirects) {
    const result = await _singleRequest(currentUrl, timeout);
    if (result.status >= 300 && result.status < 400 && result.headers.location) {
      redirects.push({ url: currentUrl, status: result.status });
      const loc = result.headers.location;
      currentUrl = loc.startsWith('http') ? loc : new URL(loc, currentUrl).href;
      hops++;
      continue;
    }

    // Final response
    const secHeaders = {};
    const missingSecHeaders = [];
    for (const h of SECURITY_HEADERS) {
      if (result.headers[h]) {
        secHeaders[h] = result.headers[h];
      } else {
        missingSecHeaders.push(h);
      }
    }

    const sslInfo = currentUrl.startsWith('https://') ? await _getSSLInfo(currentUrl, timeout) : null;

    const warnings = [];
    if (result.responseTimeMs > 3000) warnings.push(`Slow response: ${result.responseTimeMs}ms`);
    if (missingSecHeaders.length > 3) warnings.push(`Missing ${missingSecHeaders.length} security headers`);
    if (sslInfo && sslInfo.daysRemaining < 30) warnings.push(`SSL cert expires in ${sslInfo.daysRemaining} days`);
    if (sslInfo && sslInfo.daysRemaining < 0) warnings.push('SSL certificate EXPIRED');
    if (result.status >= 400) warnings.push(`HTTP error: ${result.status} ${result.statusText}`);

    return {
      url: currentUrl,
      originalUrl: url !== currentUrl ? url : undefined,
      status: result.status,
      statusText: result.statusText,
      responseTimeMs: result.responseTimeMs,
      redirects: redirects.length > 0 ? redirects : undefined,
      securityHeaders: secHeaders,
      missingSecurityHeaders: missingSecHeaders,
      ssl: sslInfo,
      serverHeader: result.headers.server || null,
      poweredBy: result.headers['x-powered-by'] || null,
      contentType: result.headers['content-type'] || null,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  return { url, error: `Too many redirects (>${maxRedirects})`, redirects };
}

/**
 * Probe multiple URLs.
 * @param {string[]} urls
 * @param {object} [opts]
 * @returns {Promise<object[]>}
 */
async function probeMultiple(urls, opts = {}) {
  return Promise.all(urls.map(u => probe(u, opts).catch(e => ({ url: u, error: e.message }))));
}

function _singleRequest(url, timeout) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const start = Date.now();

    const req = mod.request(url, {
      method: 'HEAD',
      timeout,
      headers: { 'User-Agent': 'http-probe/1.0' },
      rejectUnauthorized: false, // we check SSL separately
    }, (res) => {
      const elapsed = Date.now() - start;
      // Drain response
      res.resume();
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          responseTimeMs: elapsed,
        });
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout after ${timeout}ms`)); });
    req.on('error', reject);
    req.end();
  });
}

function _getSSLInfo(url, timeout) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const sock = tls.connect({
        host: parsed.hostname,
        port: parseInt(parsed.port) || 443,
        servername: parsed.hostname,
        timeout,
        rejectUnauthorized: false,
      }, () => {
        try {
          const cert = sock.getPeerCertificate();
          if (!cert || !cert.subject) {
            sock.destroy();
            resolve(null);
            return;
          }
          const validTo = new Date(cert.valid_to);
          const daysRemaining = Math.floor((validTo - Date.now()) / 86400000);
          resolve({
            subject: cert.subject.CN || cert.subject.O || 'unknown',
            issuer: cert.issuer ? (cert.issuer.O || cert.issuer.CN || 'unknown') : 'unknown',
            validFrom: cert.valid_from,
            validTo: cert.valid_to,
            daysRemaining,
            serialNumber: cert.serialNumber,
          });
        } catch (e) {
          resolve(null);
        }
        sock.destroy();
      });

      sock.on('error', () => { resolve(null); });
      sock.on('timeout', () => { sock.destroy(); resolve(null); });
    } catch (e) {
      resolve(null);
    }
  });
}

// --- CLI ---
function formatResult(r) {
  const lines = [];
  lines.push(`\n🔍 ${r.url}`);
  if (r.originalUrl) lines.push(`  ↳ (redirected from ${r.originalUrl})`);
  if (r.error) { lines.push(`  ❌ Error: ${r.error}`); return lines.join('\n'); }

  const statusEmoji = r.status < 300 ? '✅' : r.status < 400 ? '↪️' : '❌';
  lines.push(`  ${statusEmoji} Status: ${r.status} ${r.statusText}`);
  lines.push(`  ⏱️  Response: ${r.responseTimeMs}ms`);
  if (r.serverHeader) lines.push(`  🖥️  Server: ${r.serverHeader}`);
  if (r.contentType) lines.push(`  📄 Type: ${r.contentType}`);

  if (r.redirects && r.redirects.length > 0) {
    lines.push(`  ↪️ Redirects (${r.redirects.length}):`);
    r.redirects.forEach(rd => lines.push(`     ${rd.status} → ${rd.url}`));
  }

  if (r.ssl) {
    const certEmoji = r.ssl.daysRemaining < 0 ? '🔴' : r.ssl.daysRemaining < 30 ? '🟡' : '🟢';
    lines.push(`  🔒 SSL: ${r.ssl.subject} (issuer: ${r.ssl.issuer})`);
    lines.push(`     ${certEmoji} Expires: ${r.ssl.validTo} (${r.ssl.daysRemaining} days)`);
  }

  const secCount = Object.keys(r.securityHeaders).length;
  const totalSec = secCount + (r.missingSecurityHeaders ? r.missingSecurityHeaders.length : 0);
  const secEmoji = secCount >= totalSec * 0.7 ? '🟢' : secCount >= totalSec * 0.4 ? '🟡' : '🔴';
  lines.push(`  🛡️  Security Headers: ${secEmoji} ${secCount}/${totalSec} present`);
  if (r.missingSecurityHeaders && r.missingSecurityHeaders.length > 0) {
    lines.push(`     Missing: ${r.missingSecurityHeaders.join(', ')}`);
  }

  if (r.warnings && r.warnings.length > 0) {
    lines.push(`  ⚠️  Warnings:`);
    r.warnings.forEach(w => lines.push(`     - ${w}`));
  }

  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  let jsonMode = false;
  let timeout = 10000;
  const urls = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') { jsonMode = true; continue; }
    if (args[i] === '--timeout' && args[i + 1]) { timeout = parseInt(args[i + 1]); i++; continue; }
    if (args[i].startsWith('http://') || args[i].startsWith('https://')) urls.push(args[i]);
  }

  if (urls.length === 0) {
    console.log('Usage: node index.js [--json] [--timeout ms] <url> [url2 ...]');
    process.exit(1);
  }

  const results = await probeMultiple(urls, { timeout });

  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    results.forEach(r => console.log(formatResult(r)));
  }
}

if (require.main === module) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { probe, probeMultiple };
