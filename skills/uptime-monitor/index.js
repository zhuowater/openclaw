#!/usr/bin/env node
'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const DEFAULT_TIMEOUT = 10000;

/**
 * Check a single endpoint's health.
 * @param {string|object} target - URL string or { url, expect, timeout, name }
 * @param {object} opts - { timeout, expect, json }
 * @returns {Promise<object>} { url, name, status, statusCode, latencyMs, error? }
 */
async function checkEndpoint(target, opts = {}) {
  const config = typeof target === 'string'
    ? { url: target, name: target }
    : { url: target.url, name: target.name || target.url, expect: target.expect, timeout: target.timeout };

  const url = config.url;
  const name = config.name;
  const timeout = config.timeout || opts.timeout || DEFAULT_TIMEOUT;
  const expectStatus = config.expect || opts.expect || null;

  const start = Date.now();
  
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      resolve({
        url, name, status: 'error', statusCode: null,
        latencyMs: Date.now() - start, error: `Invalid URL: ${e.message}`
      });
      return;
    }

    const mod = parsed.protocol === 'https:' ? https : http;
    
    const req = mod.get(url, { timeout, rejectUnauthorized: false }, (res) => {
      // Consume body to free socket
      res.resume();
      res.on('end', () => {
        const latencyMs = Date.now() - start;
        const code = res.statusCode;
        let status = 'up';
        
        if (expectStatus && code !== expectStatus) {
          status = 'unexpected';
        } else if (code >= 500) {
          status = 'error';
        } else if (code >= 400) {
          status = 'client_error';
        }

        resolve({
          url, name, status, statusCode: code,
          statusText: res.statusMessage, latencyMs
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        url, name, status: 'timeout', statusCode: null,
        latencyMs: timeout, error: `Timeout after ${timeout}ms`
      });
    });

    req.on('error', (err) => {
      resolve({
        url, name, status: 'down', statusCode: null,
        latencyMs: Date.now() - start, error: err.message
      });
    });
  });
}

/**
 * Check multiple endpoints.
 * @param {Array<string|object>} targets
 * @param {object} opts
 * @returns {Promise<Array<object>>}
 */
async function checkAll(targets, opts = {}) {
  return Promise.all(targets.map(t => checkEndpoint(t, opts)));
}

/**
 * Format a single result for human display.
 */
function formatResult(r) {
  const emoji = r.status === 'up' ? '✅' :
                r.status === 'timeout' ? '⏱️' :
                r.status === 'down' ? '❌' :
                r.status === 'error' ? '⚠️' :
                r.status === 'unexpected' ? '🔶' :
                r.status === 'client_error' ? '🔸' : '❓';
  
  const statusPart = r.statusCode
    ? `${r.statusCode} ${r.statusText || ''}`
    : (r.error || r.status.toUpperCase());
  
  const display = r.name !== r.url ? `${r.name} (${r.url})` : r.url;
  return `${emoji} ${display} — ${statusPart.trim()} (${r.latencyMs}ms)`;
}

/**
 * Summary stats.
 */
function summarize(results) {
  const up = results.filter(r => r.status === 'up').length;
  const total = results.length;
  const avgLatency = Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / total);
  const maxLatency = Math.max(...results.map(r => r.latencyMs));
  return { up, down: total - up, total, avgLatency, maxLatency };
}

// --- CLI ---

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`uptime-monitor — Endpoint health checker

Usage:
  node index.js check [--timeout N] [--expect CODE] [--json] URL [URL...]
  node index.js batch [--json] CONFIG_FILE

Options:
  --timeout N     Request timeout in ms (default: ${DEFAULT_TIMEOUT})
  --expect CODE   Expected HTTP status code
  --json          Output as JSON`);
    return;
  }

  const cmd = args[0];
  const flags = {};
  const positional = [];

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--timeout' && args[i + 1]) {
      flags.timeout = parseInt(args[++i], 10);
    } else if (args[i] === '--expect' && args[i + 1]) {
      flags.expect = parseInt(args[++i], 10);
    } else if (args[i] === '--json') {
      flags.json = true;
    } else {
      positional.push(args[i]);
    }
  }

  let targets = [];

  if (cmd === 'check') {
    targets = positional;
  } else if (cmd === 'batch') {
    const configPath = positional[0];
    if (!configPath) {
      console.error('Error: batch requires a config file path');
      process.exit(1);
    }
    try {
      targets = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      console.error(`Error reading config: ${e.message}`);
      process.exit(1);
    }
  } else {
    console.error(`Unknown command: ${cmd}. Use 'check' or 'batch'.`);
    process.exit(1);
  }

  if (targets.length === 0) {
    console.error('No targets specified.');
    process.exit(1);
  }

  const results = await checkAll(targets, flags);
  
  if (flags.json) {
    const summary = summarize(results);
    console.log(JSON.stringify({ results, summary }, null, 2));
  } else {
    results.forEach(r => console.log(formatResult(r)));
    if (results.length > 1) {
      const s = summarize(results);
      console.log(`\n📊 Summary: ${s.up}/${s.total} up | avg ${s.avgLatency}ms | max ${s.maxLatency}ms`);
    }
  }

  // Exit with error code if any endpoint is down
  const hasDown = results.some(r => r.status !== 'up');
  if (hasDown) process.exit(1);
}

// Export for programmatic use
module.exports = { checkEndpoint, checkAll, summarize, formatResult, main };

// Run CLI if invoked directly
if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
