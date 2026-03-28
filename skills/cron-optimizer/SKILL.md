---
name: cron-optimizer
description: Analyze and optimize OpenClaw cron job scheduling. Detects scheduling conflicts, resource contention, cost projections, and suggests optimal timing. Use when asked to "optimize crons", "check scheduling conflicts", "cron cost", "reduce token usage", "优化定时任务", "cron冲突检测".
---

# Cron Optimizer

Analyzes all registered OpenClaw cron jobs and provides optimization recommendations.

## Usage

```bash
# Full optimization report
node /root/openclaw/skills/cron-optimizer/index.js

# JSON output
node /root/openclaw/skills/cron-optimizer/index.js --json

# Only show conflicts
node /root/openclaw/skills/cron-optimizer/index.js --conflicts

# Simulate schedule for next N hours
node /root/openclaw/skills/cron-optimizer/index.js --simulate 24
```

## What It Analyzes

| Check | Description |
|-------|-------------|
| **Conflicts** | Jobs scheduled to fire within 2 minutes of each other |
| **Clustering** | Time periods with too many jobs (resource contention) |
| **Cost Projection** | Estimated token/API costs per job based on frequency |
| **Quiet Hours** | Jobs firing during 23:00-08:00 that could be deferred |
| **Stale Mode** | War-mode or temporary crons that may be obsolete |
| **Spread** | Suggests staggering jobs for even resource distribution |

## When to Use

- After adding new cron jobs
- Periodic optimization (monthly)
- When token costs seem high
- When jobs seem to interfere with each other
- Transitioning from war-mode to normal operations

## Output

Returns structured report with:
- Schedule timeline visualization (next 24h)
- Conflict pairs with suggested resolution
- Cost estimates per job (low/medium/high)
- Optimization recommendations ranked by impact
