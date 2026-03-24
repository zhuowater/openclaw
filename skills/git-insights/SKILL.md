---
name: git-insights
description: Analyze git history for change hotspots, file coupling, and commit velocity. Use when asked "which files change most", "what are the hotspots", "commit trends", "which files change together", "git history analysis", "change frequency", "代码热点", "变更趋势".
---

# Git Insights

Mine git history for actionable intelligence about codebase evolution patterns.

## Features

- **Hotspots** — Files with highest change frequency (maintenance magnets)
- **Coupling** — Files that change together in commits (hidden dependencies)
- **Velocity** — Commit rate over time (daily/weekly trends)
- **Churn** — Lines added vs removed per file (volatility metric)

## CLI Usage

```bash
# Full report (last 90 days)
node skills/git-insights/index.js

# Hotspots only
node skills/git-insights/index.js --hotspots

# File coupling analysis
node skills/git-insights/index.js --coupling

# Commit velocity (daily buckets)
node skills/git-insights/index.js --velocity

# Churn analysis (top volatile files)
node skills/git-insights/index.js --churn

# Custom date range
node skills/git-insights/index.js --days 30

# JSON output
node skills/git-insights/index.js --json

# Specific path filter
node skills/git-insights/index.js --path skills/
```

## Programmatic API

```js
const { hotspots, coupling, velocity, churn, fullReport } = require('./skills/git-insights');

// Get top 20 most-changed files in last 90 days
const spots = await hotspots({ days: 90, limit: 20 });
// => [{ file: 'MEMORY.md', changes: 142, insertions: 3200, deletions: 2800 }, ...]

// Find files that change together (>= 3 co-occurrences)
const pairs = await coupling({ days: 90, minCooccurrences: 3 });
// => [{ files: ['a.js', 'b.js'], cooccurrences: 12, strength: 0.85 }, ...]

// Daily commit counts
const vel = await velocity({ days: 30, bucket: 'day' });
// => [{ date: '2026-03-01', commits: 8 }, ...]

// File churn (lines added + removed)
const ch = await churn({ days: 30, limit: 15 });
// => [{ file: 'MEMORY.md', added: 500, removed: 480, net: 20, churnRate: 980 }, ...]
```
