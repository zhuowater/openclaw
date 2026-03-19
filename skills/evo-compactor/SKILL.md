---
name: evo-compactor
description: Compact and optimize evolution data files (memory_graph.jsonl, events.jsonl, prompt files). Reduces evolver scan time and token usage. Use when disk usage is high, evolution is slow, or during periodic maintenance. Triggers on "compact evolution", "evolution cleanup", "optimize evolver data".
---

# evo-compactor

Compresses evolution data to reduce scan overhead and LLM token consumption.

## What It Does

1. **memory_graph.jsonl**: Archives entries older than 7 days, keeping only recent active data
2. **events.jsonl**: Archives events older than 14 days (keeps last 20 in working set)
3. **GEP prompt files**: Removes prompt files older than 3 days (they're one-shot artifacts)
4. **Deduplication**: Removes duplicate memory_graph entries (same gene+signal combination)

## Usage

```bash
# Dry run - show what would be compacted
node /root/openclaw/skills/evo-compactor/index.js

# Actually compact
node /root/openclaw/skills/evo-compactor/index.js --compact

# JSON output
node /root/openclaw/skills/evo-compactor/index.js --compact --json
```

## Safety

- Archived data goes to `*_archive.jsonl` (never deleted)
- Working set always keeps minimum 20 recent entries
- Prompt files are deleted (they can be regenerated)
- Dry run is default (must pass `--compact` to execute)
