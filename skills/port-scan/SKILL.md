---
name: port-scan
description: Lightweight TCP port scanner in pure Node.js, zero external dependencies. Use when asked to scan ports, check open services, probe network hosts, verify firewall rules, or do security reconnaissance. Triggers on "scan ports", "port scan", "check ports", "open ports", "nmap alternative", "端口扫描", "扫描端口", "服务探测".
---

# port-scan

Pure Node.js TCP port scanner. No nmap, no pip, no native deps. Just `node index.js <host>`.

## Usage

```bash
# Scan top 100 ports (fast)
node skills/port-scan/index.js 192.168.1.1

# Scan specific ports
node skills/port-scan/index.js example.com -p 80,443,8080,3306

# Scan range with banner grabbing
node skills/port-scan/index.js 10.0.0.1 -p 1-1024 --banner

# Top 1000 ports, JSON output
node skills/port-scan/index.js target.com -p top-1000 --json

# Quick check, only open ports shown
node skills/port-scan/index.js host.local -q
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `-p, --ports` | top-100 | Port spec: `80,443`, `1-1024`, `top-100`, `top-1000` |
| `-t, --timeout` | 2000 | Connection timeout (ms) |
| `--concurrency` | 100 | Max simultaneous connections |
| `-b, --banner` | off | Grab service banners |
| `-j, --json` | off | JSON output |
| `-q, --quiet` | off | Only show open ports |

## Programmatic

```javascript
const { scan } = require('./skills/port-scan');
const result = await scan('192.168.1.1', { ports: '22,80,443', banner: true });
console.log(result.open); // [{ port: 80, state: 'open', service: 'http' }, ...]
```

## Notes

- Concurrency-limited to avoid network floods
- Distinguishes open/closed/filtered states
- Maps 100+ common ports to service names
- ⚠️ Only scan hosts you're authorized to scan
