---
name: perf-metric
description: Evolution performance dashboard. Analyzes GEP events, genes, capsules to report success rates, intent breakdown, gene effectiveness, blast radius stats, streaks, and timeline. Use when you need to assess evolution health, find stagnation patterns, or generate a performance report for the GEP system.
---

# Perf Metric

Reads GEP assets (events.jsonl, genes.json, capsules.json) and produces a structured performance report.

## Exported Functions

### `analyze(assetsDir?)`
Returns a metrics object:
- `summary` — total events, success rate, failure rate
- `intentBreakdown` — counts per intent (repair/optimize/innovate)
- `geneEffectiveness` — per-gene success count, fail count, success rate
- `blastRadius` — min/max/avg files and lines touched
- `streaks` — current and longest success/failure streaks
- `timeline` — chronological event summaries

### `report(assetsDir?)`
Returns a human-readable markdown string of the above.

## Usage

```javascript
const { analyze, report } = require('./skills/perf-metric');
const metrics = analyze(); // defaults to skills/evolver/assets/gep
console.log(report());
```

## CLI

```bash
node skills/perf-metric/index.js
```
