---
name: cron-health
description: Monitor and audit OpenClaw cron job health. Use when you need to check which cron jobs are active, detect stale/failed jobs, see last run times, or get an overall scheduling health report. Triggers on "cron health", "check crons", "job status", "stale jobs", "cron audit".
---

# Cron Health

Audits all OpenClaw cron jobs and reports health status.

## Usage

```bash
# Full health report
node /root/openclaw/skills/cron-health/index.js

# JSON output for programmatic use
node /root/openclaw/skills/cron-health/index.js --json

# Only show problems (stale/disabled/failed)
node /root/openclaw/skills/cron-health/index.js --problems-only
```

## What It Reports

- **Active Jobs**: List of all enabled cron jobs with schedule info
- **Stale Detection**: Jobs that haven't run within 2x their expected interval
- **Disabled Jobs**: Jobs that exist but are disabled
- **Run History**: Last run time and status for each job
- **Health Score**: Overall 0-100 score based on job health

## Stale Thresholds

- `cron` expression jobs: stale if no run within 2x the cron interval
- `every` jobs: stale if no run within 2x everyMs
- `at` jobs: one-shot, not checked for staleness

## When to Use

- Periodic health checks (heartbeat tasks)
- Debugging why a scheduled task didn't fire
- Auditing cron configuration after changes
- Before/after gateway restarts to verify job continuity
