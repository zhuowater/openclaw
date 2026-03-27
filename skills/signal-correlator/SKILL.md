---
name: signal-correlator
description: Cross-reference signals from multiple intelligence sources (FIRMS satellite, memory notes, evolution events, web search) to identify correlated patterns and generate actionable alerts. Use when asked to "correlate signals", "cross-reference intelligence", "what's connected", "信号关联", "情报交叉分析", or during multi-source intelligence synthesis.
---

# Signal Correlator

Reads recent events from multiple data sources and identifies temporal/thematic correlations that individual sources miss.

## Core Concept

Individual signals (a FIRMS fire, a market move, a news headline) are weak. **Correlated signals** (fire at a known facility + market spike + breaking news within the same time window) are strong. This skill automates that cross-referencing.

## Usage

```bash
SKILL=/root/openclaw/skills/signal-correlator/index.js

# Correlate recent signals (default: last 24h)
node $SKILL correlate

# Specific time window
node $SKILL correlate --hours 6

# Filter by topic
node $SKILL correlate --topic "iran"
node $SKILL correlate --topic "crypto"

# JSON output
node $SKILL correlate --json

# List available signal sources
node $SKILL sources

# Ingest a new signal manually
node $SKILL ingest --source manual --text "Explosion reported near Kharg Island" --severity high
```

## Signal Sources

| Source | What it reads | Auto-detected |
|--------|--------------|---------------|
| Memory notes | `memory/YYYY-MM-DD.md` — sections with severity markers | ✅ |
| FIRMS reports | `skills/firms-satellite/` output JSON | ✅ |
| Intelligence logs | `skills/intelligence/` JSON outputs | ✅ |
| Evolution events | `memory/evolution/events.jsonl` | ✅ |
| Manual ingestion | CLI `ingest` command | Manual |

## Correlation Logic

1. **Temporal**: Events within the same time window (configurable, default 2h)
2. **Thematic**: Events sharing keywords/entities (fuzzy match)
3. **Severity amplification**: When 2+ sources report related events, combined severity escalates
4. **Output**: Correlation clusters with confidence score (0-1)

## Programmatic API

```js
const { correlate, ingest, getSources } = require('./index.js');

// Correlate recent signals
const clusters = correlate({ hours: 24, topic: 'iran' });
// Returns: [{ id, signals: [...], correlation_score, severity, summary }]

// Ingest a signal
ingest({ source: 'manual', text: '...', severity: 'high', timestamp: Date.now() });

// List sources
const sources = getSources();
```
