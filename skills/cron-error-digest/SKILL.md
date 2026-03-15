---
name: cron-error-digest
description: Deep analysis of cron job run logs to find chronic failures, timeout patterns, and error trends. Use when asked about "cron errors", "failed jobs", "job timeouts", "cron failures", "error patterns", or when diagnosing why cron jobs keep failing.
---

# Cron Error Digest

Digs into cron run log history (`.jsonl` files) to find chronic failures, timeout patterns, and error frequency trends. Goes deeper than `cron-health` which only checks last-run status.

## Usage

```bash
# Full error digest (text)
node /root/openclaw/skills/cron-error-digest/index.js

# JSON output
node /root/openclaw/skills/cron-error-digest/index.js --json

# Only errors since a date
node /root/openclaw/skills/cron-error-digest/index.js --since=2026-03-14
```

## Programmatic

```js
const { digest, formatText } = require('./skills/cron-error-digest');

const report = digest({ sinceMs: Date.now() - 86400000 }); // last 24h
console.log(formatText(report));
// or: console.log(JSON.stringify(report));
```

## What It Reports

- **Chronic offenders**: Jobs with >50% failure rate
- **Timeout-heavy jobs**: Jobs that frequently time out
- **Error trend**: Daily error counts (last 7 days)
- **Error patterns**: Deduplicated, ranked error messages
- **Per-job breakdown**: Errors, successes, timeouts per job

## Integration

Can be added as a subsystem to `system-health-dashboard` for unified reporting.
