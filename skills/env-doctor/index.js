#!/usr/bin/env node
'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

const execFileAsync = promisify(execFile);

// ── Config ──────────────────────────────────────────────────
const CRITICAL_ENV_VARS = [
  { name: 'SKYEYE_API_KEY', hint: 'Skyeye proxy for LLM access', pattern: /^sk-/ },
  { name: 'FIRMS_MAP_KEY', hint: 'NASA FIRMS satellite fire data', pattern: /^[a-f0-9]{32}$/ },
];

const OPTIONAL_ENV_VARS = [
  { name: 'OPENAI_API_KEY', hint: 'OpenAI API' },
  { name: 'ANTHROPIC_API_KEY', hint: 'Anthropic API' },
  { name: 'ELEVENLABS_API_KEY', hint: 'ElevenLabs TTS/STT' },
  { name: 'BRAVE_API_KEY', hint: 'Brave Search' },
  { name: 'GEMINI_API_KEY', hint: 'Google Gemini' },
  { name: 'TWILIO_ACCOUNT_SID', hint: 'Twilio voice calls' },
  { name: 'TWILIO_AUTH_TOKEN', hint: 'Twilio auth' },
];

const PYTHON_PACKAGES = [
  'requests', 'json', 'urllib3', 'sys', 'os',
];

const ENDPOINTS = [
  { name: 'FIRMS API', url: 'https://firms.modaps.eosdis.nasa.gov/api/area', timeout: 10000 },
  { name: 'Polymarket CLOB', url: 'https://clob.polymarket.com/time', timeout: 10000, acceptCodes: [200, 401, 403], proxy: true },
  { name: 'Polymarket Data', url: 'https://data-api.polymarket.com/', timeout: 10000, acceptCodes: [200, 400, 403], proxy: true },
  { name: 'Polymarket Gamma', url: 'https://gamma-api.polymarket.com/events?limit=1', timeout: 10000, acceptCodes: [200, 403], proxy: true },
  { name: 'Brave Search', url: 'https://api.search.brave.com/', timeout: 8000, acceptCodes: [200, 401, 403, 422], proxy: true },
  { name: 'OpenSky ADS-B', url: 'https://opensky-network.org/api/states/all?lamin=25&lomin=44&lamax=40&lomax=65&extended=0', timeout: 15000 },
];

const NODE_SKILL_IMPORTS = [
  'exec-optimizer',
  'workspace-health',
  'cron-health',
  'memory-janitor',
  'perf-metric',
  'sysinfo',
];

// ── Helpers ─────────────────────────────────────────────────

function colorize(text, code) {
  if (!process.stdout.isTTY) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}
const green = t => colorize(t, '32');
const red = t => colorize(t, '31');
const yellow = t => colorize(t, '33');
const bold = t => colorize(t, '1');
const dim = t => colorize(t, '2');

function statusIcon(ok) { return ok ? green('✓') : red('✗'); }

function httpGet(url, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: timeoutMs }, (res) => {
      const ms = Date.now() - start;
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ ok: res.statusCode < 400, status: res.statusCode, ms, body: body.slice(0, 200) }));
    });
    req.on('error', (err) => resolve({ ok: false, status: 0, ms: Date.now() - start, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, ms: timeoutMs, error: 'timeout' }); });
  });
}

// ── Checkers ────────────────────────────────────────────────

async function checkApiKeys() {
  const results = [];
  
  for (const v of [...CRITICAL_ENV_VARS, ...OPTIONAL_ENV_VARS]) {
    const val = process.env[v.name];
    const isCritical = CRITICAL_ENV_VARS.some(c => c.name === v.name);
    const exists = !!val;
    const masked = exists ? val.slice(0, 6) + '...' + val.slice(-4) : null;
    const formatOk = exists && v.pattern ? v.pattern.test(val) : null;
    
    results.push({
      name: v.name,
      hint: v.hint,
      critical: isCritical,
      exists,
      masked,
      formatOk,
      status: !exists ? (isCritical ? 'MISSING' : 'absent') : (formatOk === false ? 'FORMAT_WARN' : 'ok'),
    });
  }
  
  return results;
}

async function checkPython() {
  const results = [];
  
  // Check Python version
  try {
    const { stdout } = await execFileAsync('python3', ['--version']);
    results.push({ name: 'python3', status: 'ok', version: stdout.trim() });
  } catch {
    results.push({ name: 'python3', status: 'MISSING', version: null });
    return results; // No point checking packages
  }

  // Check packages
  for (const pkg of PYTHON_PACKAGES) {
    try {
      await execFileAsync('python3', ['-c', `import ${pkg}; print(getattr(${pkg}, '__version__', 'builtin'))`], { timeout: 5000 });
      results.push({ name: pkg, status: 'ok' });
    } catch {
      results.push({ name: pkg, status: 'MISSING' });
    }
  }
  
  return results;
}

async function checkNode() {
  const results = [];
  
  // Node version
  results.push({ name: 'node', status: 'ok', version: process.version });
  
  // Check key skill imports
  for (const skill of NODE_SKILL_IMPORTS) {
    const skillPath = path.resolve(__dirname, '..', skill);
    try {
      const mod = require(skillPath);
      const exports = Object.keys(mod);
      results.push({ name: skill, status: 'ok', exports: exports.length });
    } catch (err) {
      results.push({ name: skill, status: 'BROKEN', error: err.message.split('\n')[0] });
    }
  }
  
  return results;
}

async function checkEndpoints() {
  const results = [];
  
  // Check proxy first
  let proxyOk = false;
  try {
    const { stdout } = await execFileAsync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--connect-timeout', '5', '--socks5-hostname', '127.0.0.1:7880', 'https://api.polymarket.com'], { timeout: 8000 });
    proxyOk = stdout.trim() !== '000';
    results.push({ name: 'SOCKS5 Proxy (7880)', status: proxyOk ? 'ok' : 'DOWN', ms: null });
  } catch {
    results.push({ name: 'SOCKS5 Proxy (7880)', status: 'DOWN', ms: null });
  }
  
  // Check endpoints
  const checks = ENDPOINTS.map(async (ep) => {
    if (ep.proxy) {
      // Use curl with SOCKS5 proxy for geo-blocked endpoints
      try {
        const start = Date.now();
        const { stdout } = await execFileAsync('curl', [
          '-s', '-o', '/dev/null', '-w', '%{http_code}',
          '--connect-timeout', '8',
          '--socks5-hostname', '127.0.0.1:7880',
          ep.url
        ], { timeout: ep.timeout + 2000 });
        const ms = Date.now() - start;
        const code = parseInt(stdout.trim(), 10);
        const acceptCodes = ep.acceptCodes || [200];
        const reachable = code > 0 && (code < 400 || acceptCodes.includes(code));
        return { name: ep.name, status: reachable ? 'ok' : 'DOWN', httpStatus: code, ms, proxy: true, error: null };
      } catch (err) {
        return { name: ep.name, status: 'DOWN', httpStatus: 0, ms: null, proxy: true, error: err.message.split('\n')[0] };
      }
    }
    const res = await httpGet(ep.url, ep.timeout);
    const acceptCodes = ep.acceptCodes || [200];
    const reachable = res.status > 0 && (res.ok || acceptCodes.includes(res.status));
    return { name: ep.name, status: reachable ? 'ok' : 'DOWN', httpStatus: res.status, ms: res.ms, error: res.error || null };
  });
  
  const endpointResults = await Promise.all(checks);
  results.push(...endpointResults);
  
  return results;
}

// ── Main Diagnostic ─────────────────────────────────────────

async function diagnose(options = {}) {
  const only = options.only || null;
  const report = { timestamp: new Date().toISOString(), sections: {} };
  
  if (!only || only === 'api-keys') {
    report.sections.apiKeys = await checkApiKeys();
  }
  if (!only || only === 'python') {
    report.sections.python = await checkPython();
  }
  if (!only || only === 'node') {
    report.sections.node = await checkNode();
  }
  if (!only || only === 'endpoints') {
    report.sections.endpoints = await checkEndpoints();
  }
  
  // Compute summary
  const allItems = Object.values(report.sections).flat();
  const issues = allItems.filter(i => i.status !== 'ok' && i.status !== 'absent');
  const critical = issues.filter(i => i.critical || i.status === 'MISSING' || i.status === 'DOWN' || i.status === 'BROKEN');
  
  report.summary = {
    total: allItems.length,
    ok: allItems.filter(i => i.status === 'ok').length,
    warnings: issues.length - critical.length,
    critical: critical.length,
    healthy: critical.length === 0,
  };
  
  return report;
}

// ── CLI Output ──────────────────────────────────────────────

function printReport(report) {
  console.log(bold('\n🩺 Environment Doctor Report'));
  console.log(dim(`   ${report.timestamp}\n`));
  
  // API Keys
  if (report.sections.apiKeys) {
    console.log(bold('  API Keys & Tokens'));
    for (const k of report.sections.apiKeys) {
      const icon = statusIcon(k.status === 'ok');
      const tag = k.critical ? red('[CRITICAL]') : dim('[optional]');
      const detail = k.exists ? dim(`(${k.masked})`) : '';
      const warn = k.formatOk === false ? yellow(' ⚠ format') : '';
      console.log(`    ${icon} ${k.name} ${tag} ${detail}${warn}`);
    }
    console.log();
  }
  
  // Python
  if (report.sections.python) {
    console.log(bold('  Python'));
    for (const p of report.sections.python) {
      const icon = statusIcon(p.status === 'ok');
      const ver = p.version ? dim(` (${p.version})`) : '';
      console.log(`    ${icon} ${p.name}${ver}`);
    }
    console.log();
  }
  
  // Node Skills
  if (report.sections.node) {
    console.log(bold('  Node.js & Skills'));
    for (const n of report.sections.node) {
      const icon = statusIcon(n.status === 'ok');
      const detail = n.version ? dim(` (${n.version})`) : n.exports ? dim(` (${n.exports} exports)`) : '';
      const err = n.error ? red(` — ${n.error.slice(0, 60)}`) : '';
      console.log(`    ${icon} ${n.name}${detail}${err}`);
    }
    console.log();
  }
  
  // Endpoints
  if (report.sections.endpoints) {
    console.log(bold('  External Endpoints'));
    for (const e of report.sections.endpoints) {
      const icon = statusIcon(e.status === 'ok');
      const ms = e.ms ? dim(` (${e.ms}ms)`) : '';
      const prx = e.proxy ? dim(' [proxy]') : '';
      const err = e.error ? red(` — ${e.error}`) : '';
      console.log(`    ${icon} ${e.name}${prx}${ms}${err}`);
    }
    console.log();
  }
  
  // Summary
  const s = report.summary;
  const color = s.healthy ? green : red;
  console.log(bold('  Summary'));
  console.log(`    ${color(s.healthy ? '✓ HEALTHY' : '✗ ISSUES FOUND')}`);
  console.log(`    ${s.ok}/${s.total} checks passed, ${s.warnings} warnings, ${s.critical} critical`);
  console.log();
}

// ── CLI Entrypoint ──────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const only = args.find(a => a.startsWith('--only'))
    ? args[args.indexOf(args.find(a => a.startsWith('--only'))) + 1]
    : null;
  
  try {
    const report = await diagnose({ only });
    
    if (jsonMode) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printReport(report);
    }
    
    process.exit(report.summary.healthy ? 0 : 1);
  } catch (err) {
    console.error('env-doctor failed:', err.message);
    process.exit(2);
  }
}

// ── Exports ─────────────────────────────────────────────────

module.exports = {
  diagnose,
  checkApiKeys,
  checkPython,
  checkNode,
  checkEndpoints,
  main,
};

if (require.main === module) {
  main();
}
