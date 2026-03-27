---
name: http-probe
description: Probe HTTP endpoints for health, security headers, SSL info, response times, and redirect chains. Use when asked to "check a URL", "test an endpoint", "probe API health", "check security headers", "SSL check", or "网站检测".
---

# http-probe

Lightweight HTTP endpoint prober. Checks health, measures response time, inspects security headers, SSL certificate info, and redirect chains.

## Usage

```bash
# Basic probe
node /root/openclaw/skills/http-probe/index.js https://example.com

# Multiple URLs
node /root/openclaw/skills/http-probe/index.js https://api.example.com https://web.example.com

# JSON output
node /root/openclaw/skills/http-probe/index.js --json https://example.com

# Timeout in ms (default 10000)
node /root/openclaw/skills/http-probe/index.js --timeout 5000 https://example.com
```

## Programmatic

```javascript
const { probe, probeMultiple } = require('./skills/http-probe');

const result = await probe('https://example.com');
// { url, status, statusText, responseTimeMs, headers, securityHeaders, ssl, redirects }

const results = await probeMultiple(['https://a.com', 'https://b.com']);
```

## Output Includes

- **Status**: HTTP status code and text
- **Timing**: DNS + connect + TLS + TTFB + total (ms)
- **Security Headers**: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, etc.
- **SSL**: Certificate subject, issuer, expiry, days remaining
- **Redirects**: Full redirect chain with status codes
- **Warnings**: Missing security headers, expiring certs, slow response
