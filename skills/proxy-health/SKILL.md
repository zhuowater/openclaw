---
name: proxy-health
description: Check health and latency of configured proxy endpoints (SOCKS5, HTTP/HTTPS). Use when asked to "check proxy", "proxy health", "is proxy working", "proxy latency", "test socks", "代理状态", "代理检测", or when network requests fail and you suspect proxy issues.
---

# Proxy Health

Check connectivity, latency, and throughput of proxy endpoints.

## Usage

```bash
# Check default proxy (socks5h://127.0.0.1:7880)
node /root/openclaw/skills/proxy-health/index.js

# Check specific proxy
node /root/openclaw/skills/proxy-health/index.js socks5://127.0.0.1:7880

# Check multiple proxies
node /root/openclaw/skills/proxy-health/index.js socks5://127.0.0.1:7880 http://127.0.0.1:8080

# JSON output
node /root/openclaw/skills/proxy-health/index.js --json

# Custom test target (default: https://httpbin.org/ip)
node /root/openclaw/skills/proxy-health/index.js --target https://api.example.com
```

## What It Reports

- **Connectivity**: Can we reach the proxy?
- **Latency**: Round-trip time through the proxy (p50, p95, p99 over 5 pings)
- **External IP**: What IP the proxy exits from
- **DNS Resolution**: Whether proxy handles DNS (SOCKS5h vs SOCKS5)
- **Status**: UP / DOWN / DEGRADED (>2s latency)

## Programmatic API

```javascript
const { checkProxy, checkAll } = require('./skills/proxy-health');
const result = await checkProxy('socks5h://127.0.0.1:7880');
// { status: 'up', latency: { p50: 120, p95: 250, p99: 300 }, externalIp: '...' }
```
