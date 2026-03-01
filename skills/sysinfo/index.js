/**
 * sysinfo — Lightweight system info snapshot
 * Replaces multiple exec calls (df, free, uptime, ps, etc.) with pure Node.js
 */

const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

/**
 * Disk usage for root filesystem
 */
async function diskUsage() {
  try {
    const out = execSync('df -B1 / 2>/dev/null | tail -1', { encoding: 'utf8', timeout: 5000 });
    const parts = out.trim().split(/\s+/);
    const total = parseInt(parts[1], 10);
    const used = parseInt(parts[2], 10);
    const available = parseInt(parts[3], 10);
    const percent = total > 0 ? Math.round((used / total) * 100) : 0;
    return { total, used, available, percent };
  } catch {
    return { total: 0, used: 0, available: 0, percent: 0, error: 'df failed' };
  }
}

/**
 * Memory usage from os module (no exec needed)
 */
function memoryUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const percent = Math.round((used / total) * 100);
  return { total, free, used, percent };
}

/**
 * CPU load averages and core count (no exec needed)
 */
function cpuLoad() {
  return {
    loadavg: os.loadavg().map(v => Math.round(v * 100) / 100),
    cores: os.cpus().length,
    model: os.cpus()[0]?.model || 'unknown'
  };
}

/**
 * Node.js process info (no exec needed)
 */
function nodeInfo() {
  const mem = process.memoryUsage();
  return {
    version: process.version,
    uptime: Math.round(process.uptime()),
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal
  };
}

/**
 * Top processes by memory (single exec call)
 */
async function processes(limit = 10) {
  try {
    const out = execSync(
      `ps aux --sort=-rss 2>/dev/null | head -${limit + 1}`,
      { encoding: 'utf8', timeout: 5000 }
    );
    const lines = out.trim().split('\n');
    const procs = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].trim().split(/\s+/);
      if (parts.length >= 11) {
        procs.push({
          pid: parseInt(parts[1], 10),
          cpu: parseFloat(parts[2]),
          mem: parseFloat(parts[3]),
          rss: parseInt(parts[5], 10) * 1024, // KB to bytes
          name: parts[10]
        });
      }
    }
    return procs;
  } catch {
    return [];
  }
}

/**
 * Format bytes to human-readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + units[i];
}

/**
 * Format seconds to human-readable duration
 */
function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

/**
 * Full system snapshot — the main export
 * One call replaces: df -h + free -m + uptime + ps aux + node -v
 */
async function snapshot() {
  const [disk, mem, cpu, node, procs] = await Promise.all([
    diskUsage(),
    memoryUsage(),
    cpuLoad(),
    nodeInfo(),
    processes(8)
  ]);

  return {
    timestamp: new Date().toISOString(),
    os: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      uptime: os.uptime()
    },
    cpu,
    memory: mem,
    disk,
    node,
    topProcesses: procs
  };
}

/**
 * Pretty-print snapshot to console
 */
async function report() {
  const s = await snapshot();
  const lines = [
    `System Snapshot @ ${s.timestamp}`,
    '─'.repeat(40),
    `OS:      ${s.os.platform} ${s.os.release} (${s.os.arch})`,
    `Host:    ${s.os.hostname}`,
    `Uptime:  ${formatUptime(s.os.uptime)}`,
    `Node:    ${s.node.version} (RSS: ${formatBytes(s.node.rss)}, Heap: ${formatBytes(s.node.heapUsed)})`,
    '─'.repeat(40),
    `CPU:     ${s.cpu.cores} cores, load: ${s.cpu.loadavg.join(' / ')}`,
    `Memory:  ${formatBytes(s.memory.used)} / ${formatBytes(s.memory.total)} (${s.memory.percent}%)`,
    `Disk:    ${formatBytes(s.disk.used)} / ${formatBytes(s.disk.total)} (${s.disk.percent}%)`,
    '─'.repeat(40),
    `Top Processes (by RSS):`
  ];
  for (const p of s.topProcesses.slice(0, 8)) {
    lines.push(`  PID ${String(p.pid).padEnd(7)} ${(p.name || '?').padEnd(16)} ${formatBytes(p.rss).padStart(8)}  ${p.cpu}%`);
  }
  return lines.join('\n');
}

// CLI entry point
if (require.main === module) {
  report().then(r => console.log(r)).catch(e => console.error(e));
}

module.exports = { snapshot, diskUsage, memoryUsage, cpuLoad, processes, nodeInfo, report, formatBytes, formatUptime };
