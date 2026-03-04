---
name: env-doctor
description: Diagnose environment health — checks API keys, Python/Node dependencies, external endpoints, and env vars the agent relies on. Use when tools fail unexpectedly, after system updates, or for periodic health audits. Triggers on "env check", "why is X broken", "dependency check", "api key status", "env doctor", "环境检查".
---

# env-doctor

Single-command environment diagnostic. Checks everything the agent depends on.

## Usage

```bash
# Full diagnostic
node /root/openclaw/skills/env-doctor/index.js

# JSON output
node /root/openclaw/skills/env-doctor/index.js --json

# Check specific category
node /root/openclaw/skills/env-doctor/index.js --only api-keys
node /root/openclaw/skills/env-doctor/index.js --only python
node /root/openclaw/skills/env-doctor/index.js --only node
node /root/openclaw/skills/env-doctor/index.js --only endpoints
```

## What It Checks

### API Keys & Tokens
- Presence of critical env vars (SKYEYE_API_KEY, FIRMS_API_KEY, etc.)
- Basic format validation (not full auth test)
- Expiry hints where possible

### Python Dependencies
- Required packages for intelligence pipelines (requests, etc.)
- Version compatibility checks

### Node Dependencies
- Key skill dependencies importable
- Node version compatibility

### External Endpoints
- Reachability of critical APIs (FIRMS, GDELT, Polymarket CLOB/Data/Gamma)
- Proxy connectivity (SOCKS5)
- Response time measurement

## Programmatic API

```javascript
const { diagnose, checkApiKeys, checkPython, checkNode, checkEndpoints } = require('./skills/env-doctor');

const report = await diagnose();          // full report
const keys = await checkApiKeys();        // just API keys
const endpoints = await checkEndpoints(); // just endpoints
```
