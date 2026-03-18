---
name: perf-metric
description: Evolution performance dashboard. Analyzes GEP events, genes, capsules to report success rates, intent breakdown, gene effectiveness, blast radius stats, streaks, protocol drift detection, signal recycling, and timeline. Use when you need to assess evolution health, find stagnation patterns, detect protocol drift, or generate a performance report for the GEP system.
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
- `hollowCycles` — count, rate, and recent streak of no-op cycles (≤4 lines)
- `effectiveSuccessRate` — success rate excluding hollow cycles
- `protocolDrift` — intent-gene category mismatches (e.g., repair intent + innovate gene)
- `signalRepetitions` — recycled signal patterns across 3+ cycles (stagnation indicator)
- `health` — overall health score (0-1) and diagnostic flags

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
