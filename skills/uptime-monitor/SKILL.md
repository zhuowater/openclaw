---
name: uptime-monitor
description: Lightweight endpoint/URL health checker. Pings URLs, measures response times, detects outages. Use when asked to check if a site is up, monitor endpoints, or measure API latency.
---

# Uptime Monitor

Check endpoint health, measure response times, detect outages.

## Usage

```bash
# Check single URL
node /root/openclaw/skills/uptime-monitor/index.js check https://example.com

# Check multiple URLs
node /root/openclaw/skills/uptime-monitor/index.js check https://api.example.com https://docs.example.com

# Check with custom timeout (ms)
node /root/openclaw/skills/uptime-monitor/index.js check --timeout 5000 https://slow-api.example.com

# Check with expected status code
node /root/openclaw/skills/uptime-monitor/index.js check --expect 200 https://example.com

# Run a batch check from a config file (JSON array of URLs or objects)
node /root/openclaw/skills/uptime-monitor/index.js batch /path/to/endpoints.json

# Output as JSON for scripting
node /root/openclaw/skills/uptime-monitor/index.js check --json https://example.com
```

## Batch Config Format

```json
[
  "https://example.com",
  { "url": "https://api.example.com/health", "expect": 200, "timeout": 3000, "name": "API Health" }
]
```

## Output

Human-readable by default, with status emoji:
```
✅ https://example.com — 200 OK (142ms)
❌ https://dead.example.com — TIMEOUT (5000ms)
⚠️ https://api.example.com — 503 Service Unavailable (89ms)
```

JSON mode (`--json`) returns structured results for further processing.

## When to Use

- User asks "is X up?" or "check if Y is responding"
- Monitoring API endpoints before/after deployments
- Periodic health checks via cron
- Diagnosing connectivity issues
