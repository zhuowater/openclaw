#!/usr/bin/env node
'use strict';

const net = require('net');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_PROXY = 'socks5h://127.0.0.1:7880';
const DEFAULT_TARGET = 'https://httpbin.org/ip';
const PING_COUNT = 5;
const TIMEOUT_MS = 10000;

/**
 * Connect to a SOCKS5 proxy and issue a request through it.
 * Returns { status, latency, externalIp, error }
 */
async function socks5Connect(proxyHost, proxyPort, targetHost, targetPort, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = net.createConnection({ host: proxyHost, port: proxyPort });
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve({ ok: false, latencyMs: Date.now() - start, error: 'timeout' });
      }
    }, timeoutMs);

    socket.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, latencyMs: Date.now() - start, error: err.code || err.message });
      }
    });

    socket.on('connect', () => {
      // SOCKS5 handshake: no auth
      const greeting = Buffer.from([0x05, 0x01, 0x00]);
      socket.write(greeting);

      let phase = 'greeting';
      let buf = Buffer.alloc(0);

      socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);

        if (phase === 'greeting' && buf.length >= 2) {
          if (buf[0] !== 0x05 || buf[1] === 0xff) {
            settled = true;
            clearTimeout(timer);
            socket.destroy();
            resolve({ ok: false, latencyMs: Date.now() - start, error: 'socks5_auth_failed' });
            return;
          }
          // Send connect request (domain name type = 0x03)
          phase = 'connect';
          buf = Buffer.alloc(0);
          const hostBuf = Buffer.from(targetHost, 'utf8');
          const req = Buffer.alloc(4 + 1 + hostBuf.length + 2);
          req[0] = 0x05; // version
          req[1] = 0x01; // CONNECT
          req[2] = 0x00; // reserved
          req[3] = 0x03; // domain
          req[4] = hostBuf.length;
          hostBuf.copy(req, 5);
          req.writeUInt16BE(targetPort, 5 + hostBuf.length);
          socket.write(req);
        } else if (phase === 'connect' && buf.length >= 4) {
          // Minimal parsing: check reply status
          if (buf[1] !== 0x00) {
            settled = true;
            clearTimeout(timer);
            socket.destroy();
            resolve({ ok: false, latencyMs: Date.now() - start, error: `socks5_reply_${buf[1]}` });
            return;
          }
          // Connection established
          settled = true;
          clearTimeout(timer);
          socket.destroy();
          resolve({ ok: true, latencyMs: Date.now() - start, error: null });
        }
      });
    });
  });
}

/**
 * Make a full HTTP(S) request through a SOCKS5 proxy.
 * Uses raw TCP tunneling for simplicity.
 */
async function fetchThroughSocks5(proxyUrl, targetUrl, timeoutMs) {
  const proxy = new URL(proxyUrl);
  const target = new URL(targetUrl);
  const proxyHost = proxy.hostname;
  const proxyPort = parseInt(proxy.port, 10) || 1080;
  const targetHost = target.hostname;
  const targetPort = parseInt(target.port, 10) || (target.protocol === 'https:' ? 443 : 80);
  const isHttps = target.protocol === 'https:';

  return new Promise((resolve) => {
    const start = Date.now();
    const socket = net.createConnection({ host: proxyHost, port: proxyPort });
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve({ ok: false, latencyMs: Date.now() - start, body: null, error: 'timeout' });
      }
    }, timeoutMs);

    socket.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, latencyMs: Date.now() - start, body: null, error: err.code || err.message });
      }
    });

    socket.on('connect', () => {
      // SOCKS5 greeting
      socket.write(Buffer.from([0x05, 0x01, 0x00]));

      let phase = 'greeting';
      let buf = Buffer.alloc(0);

      socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);

        if (phase === 'greeting' && buf.length >= 2) {
          if (buf[0] !== 0x05 || buf[1] === 0xff) {
            settled = true; clearTimeout(timer); socket.destroy();
            resolve({ ok: false, latencyMs: Date.now() - start, body: null, error: 'auth_failed' });
            return;
          }
          phase = 'connect';
          buf = Buffer.alloc(0);
          const hostBuf = Buffer.from(targetHost, 'utf8');
          const req = Buffer.alloc(4 + 1 + hostBuf.length + 2);
          req[0] = 0x05; req[1] = 0x01; req[2] = 0x00; req[3] = 0x03;
          req[4] = hostBuf.length;
          hostBuf.copy(req, 5);
          req.writeUInt16BE(targetPort, 5 + hostBuf.length);
          socket.write(req);
        } else if (phase === 'connect' && buf.length >= 10) {
          if (buf[1] !== 0x00) {
            settled = true; clearTimeout(timer); socket.destroy();
            resolve({ ok: false, latencyMs: Date.now() - start, body: null, error: `socks_err_${buf[1]}` });
            return;
          }
          phase = 'http';
          buf = Buffer.alloc(0);

          if (isHttps) {
            const tls = require('tls');
            const tlsSocket = tls.connect({ socket, servername: targetHost, rejectUnauthorized: false }, () => {
              const httpReq = `GET ${target.pathname}${target.search} HTTP/1.1\r\nHost: ${targetHost}\r\nConnection: close\r\nUser-Agent: proxy-health/1.0\r\n\r\n`;
              tlsSocket.write(httpReq);
            });
            let respBuf = '';
            tlsSocket.on('data', (d) => { respBuf += d.toString(); });
            tlsSocket.on('end', () => {
              settled = true; clearTimeout(timer);
              const latencyMs = Date.now() - start;
              const bodyStart = respBuf.indexOf('\r\n\r\n');
              const body = bodyStart >= 0 ? respBuf.slice(bodyStart + 4) : respBuf;
              resolve({ ok: true, latencyMs, body, error: null });
            });
            tlsSocket.on('error', (err) => {
              if (!settled) {
                settled = true; clearTimeout(timer);
                resolve({ ok: false, latencyMs: Date.now() - start, body: null, error: err.message });
              }
            });
          } else {
            const httpReq = `GET ${target.pathname}${target.search} HTTP/1.1\r\nHost: ${targetHost}\r\nConnection: close\r\nUser-Agent: proxy-health/1.0\r\n\r\n`;
            socket.write(httpReq);
            let respBuf = '';
            socket.on('data', (d) => { respBuf += d.toString(); });
            socket.on('end', () => {
              settled = true; clearTimeout(timer);
              const latencyMs = Date.now() - start;
              const bodyStart = respBuf.indexOf('\r\n\r\n');
              const body = bodyStart >= 0 ? respBuf.slice(bodyStart + 4) : respBuf;
              resolve({ ok: true, latencyMs, body, error: null });
            });
          }
        }
      });
    });
  });
}

/**
 * Check a single proxy endpoint.
 */
async function checkProxy(proxyUrl, opts = {}) {
  const targetUrl = opts.target || DEFAULT_TARGET;
  const pings = opts.pings || PING_COUNT;
  const timeout = opts.timeout || TIMEOUT_MS;

  const proxy = new URL(proxyUrl);
  const result = {
    proxy: proxyUrl,
    status: 'unknown',
    latency: { p50: null, p95: null, p99: null, samples: [] },
    externalIp: null,
    error: null,
    checkedAt: new Date().toISOString()
  };

  // Quick connectivity check first
  const connCheck = await socks5Connect(
    proxy.hostname,
    parseInt(proxy.port, 10) || 1080,
    'httpbin.org', 443,
    timeout
  );

  if (!connCheck.ok) {
    result.status = 'down';
    result.error = connCheck.error;
    return result;
  }

  // Run multiple pings for latency measurement
  const latencies = [];
  for (let i = 0; i < pings; i++) {
    const resp = await fetchThroughSocks5(proxyUrl, targetUrl, timeout);
    if (resp.ok) {
      latencies.push(resp.latencyMs);
      // Try to extract external IP from httpbin response
      if (!result.externalIp && resp.body) {
        try {
          const parsed = JSON.parse(resp.body.trim());
          if (parsed.origin) result.externalIp = parsed.origin;
        } catch (_) { /* not JSON */ }
      }
    } else {
      latencies.push(null);
    }
  }

  const validLatencies = latencies.filter(l => l !== null).sort((a, b) => a - b);
  if (validLatencies.length === 0) {
    result.status = 'down';
    result.error = 'all_pings_failed';
    return result;
  }

  result.latency.samples = validLatencies;
  result.latency.p50 = validLatencies[Math.floor(validLatencies.length * 0.5)];
  result.latency.p95 = validLatencies[Math.floor(validLatencies.length * 0.95)] || validLatencies[validLatencies.length - 1];
  result.latency.p99 = validLatencies[validLatencies.length - 1];

  const failRate = (latencies.length - validLatencies.length) / latencies.length;
  if (failRate > 0.5) {
    result.status = 'degraded';
    result.error = `${Math.round(failRate * 100)}% packet loss`;
  } else if (result.latency.p50 > 2000) {
    result.status = 'degraded';
    result.error = `high_latency_${result.latency.p50}ms`;
  } else {
    result.status = 'up';
  }

  return result;
}

/**
 * Check multiple proxies.
 */
async function checkAll(proxyUrls, opts = {}) {
  const results = [];
  for (const url of proxyUrls) {
    results.push(await checkProxy(url, opts));
  }
  return results;
}

/**
 * Format results for human-readable output.
 */
function formatResults(results) {
  const lines = ['=== Proxy Health Report ===', ''];
  for (const r of results) {
    const icon = r.status === 'up' ? '✅' : r.status === 'degraded' ? '⚠️' : '❌';
    lines.push(`${icon} ${r.proxy}`);
    lines.push(`   Status: ${r.status.toUpperCase()}`);
    if (r.latency.p50 !== null) {
      lines.push(`   Latency: p50=${r.latency.p50}ms  p95=${r.latency.p95}ms  p99=${r.latency.p99}ms`);
    }
    if (r.externalIp) {
      lines.push(`   Exit IP: ${r.externalIp}`);
    }
    if (r.error) {
      lines.push(`   Error: ${r.error}`);
    }
    lines.push(`   Checked: ${r.checkedAt}`);
    lines.push('');
  }
  return lines.join('\n');
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const targetIdx = args.indexOf('--target');
  const target = targetIdx >= 0 ? args[targetIdx + 1] : DEFAULT_TARGET;

  const proxies = args.filter(a => !a.startsWith('--') && (args[args.indexOf(a) - 1] !== '--target'));
  if (proxies.length === 0) proxies.push(DEFAULT_PROXY);

  const results = await checkAll(proxies, { target });

  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(formatResults(results));
  }

  // Exit with error code if any proxy is down
  const anyDown = results.some(r => r.status === 'down');
  process.exit(anyDown ? 1 : 0);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(2);
  });
}

module.exports = { checkProxy, checkAll, formatResults };
