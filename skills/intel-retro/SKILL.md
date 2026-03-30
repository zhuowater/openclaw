---
name: intel-retro
description: Intelligence retrospective — compare past predictions against outcomes to measure forecasting accuracy and identify systematic biases. Use when asked for "intel retro", "prediction accuracy", "forecast review", "情报复盘", "预测准确率", "Brier score", or during weekly/monthly intelligence reviews.
---

# intel-retro

**Purpose**: Extract predictions from past intelligence reports, compare them against what actually happened, and compute accuracy metrics. Improves forecasting calibration over time.

## Philosophy

> "The best forecasters aren't the most confident — they're the most calibrated."  
> — Philip Tetlock, *Superforecasting*

Intelligence without accountability is just storytelling. This skill closes the feedback loop.

## Usage

```bash
SKILL=/root/openclaw/skills/intel-retro/index.js

# Retrospective on last 7 days of intelligence reports
node $SKILL retro --days 7

# Retrospective on a specific date range
node $SKILL retro --from 2026-03-01 --to 2026-03-30

# Extract predictions from a specific report (without scoring)
node $SKILL extract --file memory/2026-03-30.md

# Show cumulative accuracy stats
node $SKILL stats

# JSON output
node $SKILL retro --days 7 --json
```

## How It Works

1. **Extract**: Scans `memory/YYYY-MM-DD.md` files for prediction markers:
   - "趋势预判" sections
   - "预测/predict/forecast/will/expect" language
   - Confidence qualifiers (high/medium/low, likely/unlikely)

2. **Score**: For each prediction, searches later reports + web for outcome:
   - ✅ Correct — prediction matched outcome
   - ❌ Wrong — prediction contradicted by outcome
   - ⏳ Pending — not yet resolvable
   - 🔄 Partially correct

3. **Analyze**: Computes metrics:
   - Hit rate (correct / total resolved)
   - Calibration (did 80% confidence predictions happen 80% of the time?)
   - Bias detection (systematic over/under-confidence in specific domains)
   - Brier score (lower = better calibrated)

4. **Learn**: Outputs actionable lessons for improving future forecasts

## Output Format

```
╔══════════════════════════════════════════════╗
║  Intelligence Retrospective: Mar 1-30, 2026  ║
╠══════════════════════════════════════════════╣
║ Total predictions: 47                         ║
║ Resolved: 31 | Pending: 16                   ║
║ Hit rate: 68% (21/31)                         ║
║ Brier score: 0.21 (good)                     ║
╠══════════════════════════════════════════════╣
║ DOMAIN BREAKDOWN                              ║
║ • Geopolitics: 72% (13/18) — slight overconf  ║
║ • Cyber: 80% (4/5) — well calibrated          ║
║ • Markets: 50% (4/8) — underperforming        ║
╠══════════════════════════════════════════════╣
║ KEY LESSONS                                   ║
║ 1. Market predictions lack edge — reduce      ║
║    confidence or add more data sources        ║
║ 2. Geopolitical escalation bias — tendency     ║
║    to over-predict escalation                 ║
╚══════════════════════════════════════════════╝
```

## Persistence

Scored predictions are saved to `memory/intel-retro-scores.json` for cumulative tracking. The file is append-only — each run adds new scores without overwriting history.

## Integration

- Run weekly via cron for automated calibration tracking
- Feed lessons back into intelligence report generation prompts
- Compare scores across time periods to measure improvement
