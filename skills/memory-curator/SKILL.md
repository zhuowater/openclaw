---
name: memory-curator
description: Detect MEMORY.md staleness and generate a curated update diff from recent daily notes. Use when MEMORY.md is stale (>3 days since last update), during heartbeat memory maintenance, or when asked to update/refresh long-term memory. Outputs a structured diff that can be applied to MEMORY.md.
---

# memory-curator

**Purpose**: Prevent memory entropy by automatically detecting when MEMORY.md is stale and generating curated updates from daily notes.

## Philosophy

SOUL.md says: "停止更新它们 = 停止对抗熵增 = 退化 = 死亡"

This skill implements the anti-entropy maintenance loop:
1. **Detect** staleness (days since last MEMORY.md update)
2. **Extract** key facts from daily notes since last update
3. **Generate** a structured update diff
4. **Report** what needs to change

## CLI Usage

```bash
# Check staleness (returns JSON with days_stale, needs_update, daily_notes_count)
node skills/memory-curator/index.js check

# Generate update report (extracts key items from unprocessed daily notes)
node skills/memory-curator/index.js report

# Generate the actual diff to apply to MEMORY.md
node skills/memory-curator/index.js diff
```

## Programmatic Usage

```javascript
const { checkStaleness, generateReport, generateDiff } = require('./skills/memory-curator');

// Quick check
const status = checkStaleness();
// { days_stale: 16, needs_update: true, last_updated: "2026-03-01", daily_notes_since: 16, total_bytes: 126727 }

// Full report
const report = generateReport();
// { sections: [...], new_items: [...], stale_items: [...], suggested_removals: [...] }
```

## When to Use

- During heartbeat memory maintenance cycles
- When `days_stale > 3`
- Before answering questions about recent context (ensures MEMORY.md is current)
- After major events that should be recorded in long-term memory

## Output Format

The `diff` command outputs markdown sections that should replace or augment corresponding sections in MEMORY.md. Each section is tagged with an action: `[ADD]`, `[UPDATE]`, or `[REMOVE]`.
