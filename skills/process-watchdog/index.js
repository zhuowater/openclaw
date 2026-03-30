#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WATCHPOINTS_FILE = path.join(__dirname, 'watchpoints.json');

// ── Default watchpoints ──────────────────────────────────────
const DEFAULT_WATCHPOINTS = [
  {
    name: 'openclaw-gateway',
    type: 'process',
    pattern: 'openclaw-cn',
    critical: true,
    description: 'OpenClaw gateway daemon'
  },
  {
    name: 'socks5-tunnel',
    type: 'systemd',
    unit: 'socks5-tunnel.service',
    critical: true,
    description: 'SOCKS5 proxy for external API access'
  },
  {
    name: 'heartbeat-daemon',
    type: 'process',
    pattern: 'heartbeat-daemon',
    critical: false,
    description: 'EvoMap heartbeat Node.js process'
  },
  {
    name: 'evomap-heartbeat',
    type: 'systemd',
    unit: 'evomap-heartbeat.service',
    critical: false,
    description: 'EvoMap heartbeat systemd service'
  }
];

// ── Helpers ──────────────────────────────────────────────────

function loadWatchpoints() {
  try {
    if (fs.existsSync(WATCHPOINTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(WATCHPOINTS_FILE, 'utf8'));
      return Array.isArray(data) ? data : DEFAULT_WATCHPOINTS;
    }
  } catch { /* ignore */ }
  return DEFAULT_WATCHPOINTS;
}

function saveWatchpoints(wps) {
  fs.writeFileSync(WATCHPOINTS_FILE, JSON.stringify(wps, null, 2));
}

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 10000 }).trim();
  } catch (e) {
    return e.stdout ? e.stdout.trim() : '';
  }
}

function humanUptime(seconds) {
  if (!seconds || seconds < 0) return 'unknown';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function humanBytes(bytes) {
  if (!bytes) return '?';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)}MB` : `${(bytes / 1024).toFixed(0)}KB`;
}

// ── Checkers ────────────────────────────────────────────────

function checkSystemdUnit(unit) {
  const result = { running: false, uptime: null, status: 'unknown' };
  
  const activeState = run(`systemctl is-active ${unit} 2>/dev/null`);
  result.running = activeState === 'active';
  result.status = activeState || 'not-found';
  
  if (result.running) {
    // Get uptime from ActiveEnterTimestamp
    const propLine = run(
      `systemctl show ${unit} --property=ActiveEnterTimestamp 2>/dev/null`
    );
    const match = propLine.match(/ActiveEnterTimestamp=(.+)/);
    if (match && match[1]) {
      const startTime = new Date(match[1]).getTime();
      if (!isNaN(startTime)) {
        result.uptime = Math.floor((Date.now() - startTime) / 1000);
      }
    }
  }
  
  return result;
}

function checkProcess(pattern) {
  const result = { running: false, pid: null, uptime: null, rss: null, status: 'not-found' };
  
  // Find process by pattern
  const psLine = run(
    `ps aux --no-headers | grep -i '${pattern}' | grep -v grep | head -1`
  );
  
  if (!psLine) return result;
  
  const parts = psLine.split(/\s+/);
  if (parts.length < 2) return result;
  
  result.running = true;
  result.pid = parseInt(parts[1], 10);
  result.status = 'running';
  
  // Get RSS from /proc
  try {
    const statm = fs.readFileSync(`/proc/${result.pid}/statm`, 'utf8').trim().split(/\s+/);
    result.rss = parseInt(statm[1], 10) * 4096; // pages to bytes
  } catch { /* permission or no proc */ }
  
  // Get start time for uptime calc
  const etimes = run(`ps -p ${result.pid} -o etimes= 2>/dev/null`);
  if (etimes) {
    result.uptime = parseInt(etimes.trim(), 10);
  }
  
  return result;
}

function checkWatchpoint(wp) {
  let health;
  if (wp.type === 'systemd') {
    health = checkSystemdUnit(wp.unit);
  } else {
    health = checkProcess(wp.pattern);
  }
  return { ...wp, ...health };
}

// ── Commands ────────────────────────────────────────────────

function cmdCheck(args) {
  const wps = loadWatchpoints();
  const jsonMode = args.includes('--json');
  const filterName = args.find(a => !a.startsWith('-'));
  
  const targets = filterName
    ? wps.filter(w => w.name.includes(filterName))
    : wps;
  
  if (targets.length === 0) {
    console.log(filterName ? `No watchpoint matching "${filterName}"` : 'No watchpoints configured.');
    return 1;
  }
  
  const results = targets.map(checkWatchpoint);
  
  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    let downCount = 0;
    let critDown = 0;
    
    for (const r of results) {
      const icon = r.running ? '🟢' : (r.critical ? '🔴' : '🟡');
      const uptimeStr = r.uptime != null ? `uptime: ${humanUptime(r.uptime)}` : '';
      const rssStr = r.rss ? `RSS: ${humanBytes(r.rss)}` : '';
      const details = [uptimeStr, rssStr].filter(Boolean).join(', ');
      const alert = !r.running ? (r.critical ? ' ← CRITICAL' : ' ← DOWN') : '';
      
      const nameCol = r.name.padEnd(24);
      const statusCol = (r.running ? 'running' : r.status).padEnd(10);
      
      console.log(`${icon} ${nameCol} ${statusCol} ${details ? `(${details})` : ''}${alert}`);
      
      if (!r.running) {
        downCount++;
        if (r.critical) critDown++;
      }
    }
    
    console.log('━'.repeat(56));
    const total = results.length;
    const healthy = total - downCount;
    let summary = `Summary: ${healthy}/${total} healthy`;
    if (critDown > 0) summary += ` | ${critDown} CRITICAL down`;
    else if (downCount > 0) summary += ` | ${downCount} non-critical down`;
    console.log(summary);
  }
  
  const hasCritDown = results.some(r => !r.running && r.critical);
  return hasCritDown ? 1 : 0;
}

function cmdList() {
  const wps = loadWatchpoints();
  console.log(`Configured watchpoints (${wps.length}):\n`);
  for (const wp of wps) {
    const typeStr = wp.type === 'systemd' ? `systemd:${wp.unit}` : `process:${wp.pattern}`;
    const critStr = wp.critical ? ' [CRITICAL]' : '';
    console.log(`  ${wp.name}${critStr}`);
    console.log(`    Type: ${typeStr}`);
    if (wp.description) console.log(`    Desc: ${wp.description}`);
    console.log();
  }
}

function cmdAdd(args) {
  const wps = loadWatchpoints();
  const opts = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) opts.name = args[++i];
    else if (args[i] === '--type' && args[i + 1]) opts.type = args[++i];
    else if (args[i] === '--unit' && args[i + 1]) opts.unit = args[++i];
    else if (args[i] === '--pattern' && args[i + 1]) opts.pattern = args[++i];
    else if (args[i] === '--critical') opts.critical = true;
    else if (args[i] === '--description' && args[i + 1]) opts.description = args[++i];
  }
  
  if (!opts.name || !opts.type) {
    console.error('Usage: add --name <name> --type <systemd|process> [--unit <unit>] [--pattern <pat>] [--critical] [--description <desc>]');
    return 1;
  }
  
  if (opts.type === 'systemd' && !opts.unit) {
    console.error('systemd type requires --unit');
    return 1;
  }
  if (opts.type === 'process' && !opts.pattern) {
    console.error('process type requires --pattern');
    return 1;
  }
  
  // Remove existing with same name
  const filtered = wps.filter(w => w.name !== opts.name);
  filtered.push({
    name: opts.name,
    type: opts.type,
    ...(opts.unit && { unit: opts.unit }),
    ...(opts.pattern && { pattern: opts.pattern }),
    critical: !!opts.critical,
    description: opts.description || ''
  });
  
  saveWatchpoints(filtered);
  console.log(`✅ Added watchpoint: ${opts.name} (${opts.type})`);
  return 0;
}

function cmdRemove(args) {
  const name = args[0];
  if (!name) {
    console.error('Usage: remove <name>');
    return 1;
  }
  
  const wps = loadWatchpoints();
  const filtered = wps.filter(w => w.name !== name);
  
  if (filtered.length === wps.length) {
    console.error(`Watchpoint "${name}" not found`);
    return 1;
  }
  
  saveWatchpoints(filtered);
  console.log(`✅ Removed watchpoint: ${name}`);
  return 0;
}

function cmdStatus() {
  const wps = loadWatchpoints();
  const results = wps.map(checkWatchpoint);
  const allOk = results.every(r => r.running);
  const critDown = results.filter(r => !r.running && r.critical);
  
  if (allOk) {
    console.log(`✅ All ${results.length} watchpoints healthy`);
    return 0;
  }
  
  const downNames = results.filter(r => !r.running).map(r => r.name);
  if (critDown.length > 0) {
    console.log(`🔴 CRITICAL: ${critDown.map(r => r.name).join(', ')} down`);
  }
  console.log(`Down: ${downNames.join(', ')} (${downNames.length}/${results.length})`);
  return critDown.length > 0 ? 1 : 0;
}

// ── Main ────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'check';
  const rest = args.slice(1);
  
  let exitCode = 0;
  
  switch (cmd) {
    case 'check':
      exitCode = cmdCheck(rest);
      break;
    case 'list':
      cmdList();
      break;
    case 'add':
      exitCode = cmdAdd(rest);
      break;
    case 'remove':
      exitCode = cmdRemove(rest);
      break;
    case 'status':
      exitCode = cmdStatus();
      break;
    default:
      console.log('Usage: process-watchdog <check|list|add|remove|status> [options]');
      console.log('  check [name] [--json]  Check watchpoint health');
      console.log('  list                   List configured watchpoints');
      console.log('  add --name <n> ...     Add a watchpoint');
      console.log('  remove <name>          Remove a watchpoint');
      console.log('  status                 Quick health summary');
      exitCode = 1;
  }
  
  process.exit(exitCode);
}

// Exports for programmatic use
module.exports = {
  checkWatchpoint,
  checkSystemdUnit,
  checkProcess,
  loadWatchpoints,
  main
};

// CLI entry
if (require.main === module) {
  main();
}
