---
name: sysinfo
description: Lightweight system info snapshot tool. Replaces multiple exec calls (df, free, uptime, ps, etc.) with a single Node.js invocation. Use when you need system health overview, disk/memory/CPU stats, or process listings. Triggers on "system info", "disk space", "memory usage", "system status", "health check".
---

# sysinfo

**Purpose**: Get a complete system health snapshot in one call instead of 5+ separate exec invocations.

## Usage

### CLI
```bash
node /root/openclaw/skills/sysinfo/index.js
```

### Programmatic
```javascript
const { snapshot, diskUsage, memoryUsage, cpuLoad, processes, nodeInfo } = require('./skills/sysinfo');

// Full snapshot (replaces: df -h + free -m + uptime + ps aux + node -v)
const info = await snapshot();

// Individual functions
const disk = await diskUsage();     // { total, used, available, percent }
const mem = memoryUsage();          // { total, free, used, percent }
const cpu = cpuLoad();              // { loadavg: [1m, 5m, 15m], cores }
const procs = await processes();    // [{ pid, name, cpu, mem }]
const node = nodeInfo();            // { version, uptime, rss, heapUsed }
```

## Output Example
```
System Snapshot @ 2026-03-01T14:00:00Z
─────────────────────────────────
OS:      Linux 6.8.0 (x64)
Uptime:  28d 14h 22m
Node:    v22.22.0 (RSS: 57MB, Heap: 32MB)
─────────────────────────────────
CPU:     2 cores, load: 0.45 / 0.38 / 0.31
Memory:  1.2G / 3.8G (32%)
Disk:    26G / 40G (64%)
─────────────────────────────────
Top Processes (by RSS):
  PID 1234  node        145MB  2.1%
  PID 5678  python3      89MB  0.5%
```
