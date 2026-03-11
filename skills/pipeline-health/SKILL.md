---
name: pipeline-health
description: Check health and data freshness of all intelligence data pipelines (FIRMS, IODA, ADS-B, VIIRS, FIFA, Trump, AIS). Use when asked "are pipelines working", "data freshness", "pipeline status", "intel health", or during heartbeat checks to detect stale/broken data sources.
---

# Pipeline Health

Scans intelligence pipeline outputs, logs, and dashboard state to produce a unified health report.

## Features

- **Data freshness** — When was each pipeline's output last updated?
- **Log analysis** — Check latest log for errors/timeouts
- **Staleness detection** — Flag pipelines that haven't produced data within expected intervals
- **Health score** — 0-100 per pipeline and overall
- **Actionable output** — Lists which pipelines need attention

## Usage

### CLI
```bash
# Full health report (human-readable)
node /root/openclaw/skills/pipeline-health/index.js

# JSON output for scripting
node /root/openclaw/skills/pipeline-health/index.js --json

# Check single pipeline
node /root/openclaw/skills/pipeline-health/index.js --pipeline firms

# Only show problems
node /root/openclaw/skills/pipeline-health/index.js --problems
```

### Programmatic
```javascript
const { checkHealth, checkPipeline } = require('./skills/pipeline-health');

// Full report
const report = checkHealth();
console.log(report.summary);     // "5/7 pipelines healthy"
console.log(report.score);       // 71
console.log(report.problems);    // [{ pipeline: 'adsb', issue: 'no data in 48h' }]

// Single pipeline
const firms = checkPipeline('firms');
console.log(firms.status);       // 'healthy' | 'stale' | 'error' | 'unknown'
```

## Pipelines Monitored

| Pipeline | Expected Interval | Data Location |
|----------|-------------------|---------------|
| FIRMS    | 6h                | firms-satellite outputs |
| IODA     | 6h                | intelligence/logs/ioda_* |
| ADS-B    | 4h                | intelligence/logs/adsb_* |
| VIIRS    | 24h               | intelligence/logs/viirs_* |
| Trump    | 24h               | intelligence/logs/trump_* |
| FIFA     | 24h               | intelligence/fifa_odds_*.json |
| AIS      | 6h                | intelligence/logs/ais_* |
