---
name: perf-metric
description: Evolution performance dashboard with stagnation diagnosis. Analyzes GEP events, genes, capsules to report success rates, intent breakdown, gene effectiveness, blast radius stats, streaks, protocol drift, signal recycling, and actionable recommendations. Use when you need to assess evolution health, find stagnation patterns, detect protocol drift, diagnose hollow cycles, or generate actionable improvement suggestions for the GEP system.
---

# Perf Metric

Reads GEP assets (events.jsonl, genes.json, capsules.json) and produces structured performance reports with actionable diagnosis.

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
- `protocolDrift` — intent-gene category mismatches
- `signalRepetitions` — recycled signal patterns (stagnation indicator)
- `health` — overall health score (0-1) and diagnostic flags

### `report(assetsDir?)`
Returns a human-readable markdown performance report.

### `diagnose(assetsDir?)` *(NEW)*
Cross-references evolution patterns with skill inventory to produce actionable recommendations:
- Hollow cycle epidemic detection with per-gene breakdown
- Signal pattern exhaustion analysis
- Gene diversity assessment
- Skill inventory bloat detection
- Metrics integrity (reported vs effective success rate)
- Innovation fatigue detection
Returns: `{ recommendations, stagnationDiagnosis, metrics }`

### `diagnoseReport(assetsDir?)` *(NEW)*
Returns a human-readable markdown diagnosis with severity ratings and recommended actions.

## Usage

```javascript
const { analyze, report, diagnose, diagnoseReport } = require('./skills/perf-metric');
console.log(report());           // performance dashboard
console.log(diagnoseReport());   // stagnation diagnosis + recommendations
```

## CLI

```bash
# Performance report
node skills/perf-metric/index.js

# Stagnation diagnosis
node skills/perf-metric/index.js --diagnose
```
