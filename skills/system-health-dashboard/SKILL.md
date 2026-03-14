---
name: system-health-dashboard
description: Unified system health dashboard that aggregates all health-check skills (workspace-health, runtime-integrity, pipeline-health, cron-health, disk-janitor, skill-gap-analyzer) into a single actionable report with severity scoring. Use when asked for "system health", "health check", "system status", "full diagnostic", "health dashboard", or during periodic maintenance.
---

# System Health Dashboard

Aggregates all health subsystem checks into one unified report with severity scoring.

## CLI Usage

```bash
# Full health report (text)
node /root/openclaw/skills/system-health-dashboard/index.js

# JSON output for programmatic use
node /root/openclaw/skills/system-health-dashboard/index.js --json

# Specific subsystems only
node /root/openclaw/skills/system-health-dashboard/index.js --only disk,cron,workspace
```

## Subsystems Checked

| Subsystem | Source Skill | What It Checks |
|-----------|-------------|----------------|
| Disk | disk-janitor | Disk usage, large files, stale data |
| Workspace | workspace-health | File structure, config integrity |
| Cron | cron-health | Job health, stale/failed jobs |
| Pipeline | pipeline-health | CI/CD and automation pipelines |
| Runtime | runtime-integrity | Process health, file integrity |
| Skills | skill-gap-analyzer | Broken/missing skills |

## Output

Each subsystem gets a severity: `✅ OK`, `⚠️ WARN`, `🔴 CRITICAL`.
Overall health score: 0-100.

## Programmatic API

```js
const { runAll, runSubsystem } = require('./skills/system-health-dashboard');
const report = await runAll();           // Full report
const disk = await runSubsystem('disk'); // Single subsystem
```
