---
name: session-cost-report
description: Analyze OpenClaw session token costs across all session types (cron, interactive, spawn). Identifies expensive sessions, cost trends, and suggests optimizations (model downgrades, schedule changes). Use when asked about "cost report", "token spend", "session costs", "expensive crons", "cost analysis", "花了多少钱", "成本分析", or during periodic financial reviews.
---

# Session Cost Report

Scans session transcripts (JSONL) to calculate real token spend per session, identify cost hotspots, and recommend savings.

## Usage

```bash
# Last 24h cost report
node skills/session-cost-report/index.js

# Last N days
node skills/session-cost-report/index.js --days 7

# JSON output
node skills/session-cost-report/index.js --json

# Only show top N expensive sessions
node skills/session-cost-report/index.js --top 10

# Filter by session type
node skills/session-cost-report/index.js --type cron
node skills/session-cost-report/index.js --type spawn
node skills/session-cost-report/index.js --type interactive
```

## What It Reports

- **Total spend** — aggregate token cost across all sessions
- **Per-session breakdown** — cost per session with model, token counts, duration
- **Type analysis** — cost by session type (cron vs interactive vs spawn)
- **Model analysis** — cost by model (opus vs sonnet vs others)
- **Top spenders** — most expensive individual sessions
- **Optimization suggestions** — actionable recommendations to reduce cost
- **Daily trend** — cost over time to spot anomalies

## Output Example

```
═══ Session Cost Report (Last 24h) ═══

💰 TOTAL: $2.45 across 47 sessions

📊 BY TYPE:
  cron:    $1.82 (74%) — 38 sessions
  spawn:   $0.41 (17%) — 6 sessions
  interactive: $0.22 (9%) — 3 sessions

🏆 TOP 5 EXPENSIVE:
  1. cron:evolver  $0.38  (opus, 52K tokens)
  2. cron:intel    $0.31  (opus, 41K tokens)
  3. spawn:gep_051 $0.28  (opus, 38K tokens)
  ...

💡 RECOMMENDATIONS:
  ⚠️ 38 cron sessions use opus — consider sonnet for routine tasks
  ⚠️ Evolver cron averages $0.35/run × 4/day = $1.40/day
  ✅ Consider consolidating intel + market crons (similar schedules)
```
