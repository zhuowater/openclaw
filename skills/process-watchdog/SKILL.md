---
name: process-watchdog
description: Monitor critical background processes and systemd services. Detects crashed/stopped services, measures uptime, and reports health status. Use when asked to "check services", "is X running", "process health", "service status", "watchdog", "进程监控", "服务状态", or during periodic health checks.
---

# process-watchdog

Monitors critical processes and systemd services. Reports status, uptime, memory usage, and detects issues.

## Usage

```bash
SKILL=/root/openclaw/skills/process-watchdog/index.js

# Check all configured watchpoints
node $SKILL check

# Check specific service
node $SKILL check socks5-tunnel

# JSON output
node $SKILL check --json

# List configured watchpoints
node $SKILL list

# Add a watchpoint (persisted to watchpoints.json)
node $SKILL add --name "socks5-tunnel" --type systemd --unit "socks5-tunnel.service" --critical
node $SKILL add --name "heartbeat" --type process --pattern "heartbeat-daemon" --critical

# Remove a watchpoint
node $SKILL remove socks5-tunnel

# Quick summary (exit code 0=all ok, 1=issues found)
node $SKILL status
```

## Output

```
🟢 openclaw-gateway    running  (uptime: 8d 12h, RSS: 28MB)
🟢 socks5-tunnel       active   (uptime: 14d 3h)
🟢 heartbeat-daemon    running  (uptime: 14d 1h, RSS: 60MB)
🔴 evomap-heartbeat    stopped  ← ALERT
━━━━━━━━━━━━━━━━━━━━━━
Summary: 3/4 healthy | 1 CRITICAL down
```

## Default Watchpoints

Pre-configured for common OpenClaw infrastructure:
- `openclaw-gateway` — the main OpenClaw process
- `socks5-tunnel` — SOCKS5 proxy for external API access
- `heartbeat-daemon` — heartbeat-daemon.js Node process
- `evomap-heartbeat` — EvoMap heartbeat systemd service

## Integration

Use in HEARTBEAT.md periodic checks:
```bash
node /root/openclaw/skills/process-watchdog/index.js status
```
Exit code 1 means at least one critical service is down — trigger alert.
