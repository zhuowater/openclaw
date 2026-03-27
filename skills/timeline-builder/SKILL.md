---
name: timeline-builder
description: Extract events from memory files and build structured chronological timelines. Use when you need to reconstruct event sequences, create intelligence briefing timelines, analyze incident chronology, or produce time-ordered reports from scattered notes. Triggers on "build timeline", "event timeline", "chronology", "时间线", "what happened when", "sequence of events".
---

# Timeline Builder

Extract date-stamped events from memory files and produce structured chronological timelines.

## Usage

```bash
SKILL=/root/openclaw/skills/timeline-builder/index.js

# Build timeline from all memory files (default: last 7 days)
node $SKILL build

# Specific date range
node $SKILL build --from 2026-03-01 --to 2026-03-27

# Filter by keyword
node $SKILL build --filter "伊朗"
node $SKILL build --filter "polymarket"

# Output as JSON
node $SKILL build --json

# Single file analysis
node $SKILL parse /root/openclaw/memory/2026-03-26.md

# Summary mode — one-liner per event
node $SKILL build --summary
```

## What It Does

1. Scans memory/*.md files for date-stamped content
2. Extracts events with timestamps, categories, and severity
3. Sorts chronologically and deduplicates
4. Outputs formatted markdown timeline or JSON

## Output Format

```
📅 2026-03-25 — 伊朗拒绝美国15点暂停战计划 [CRITICAL] [geopolitics]
📅 2026-03-26 — CVE-2026-33017 Langflow代码注入 [HIGH] [security]
```

## Programmatic API

```javascript
const { buildTimeline, parseFile } = require('./skills/timeline-builder');

const events = buildTimeline({ from: '2026-03-01', filter: 'security' });
// => [{ date, text, category, severity, source }, ...]
```
