---
name: memory-janitor
description: Automated cleanup and compaction of memory directory. Use when memory files grow too large, GEP prompt files accumulate, or memory_graph.jsonl needs trimming. Triggers on "clean memory", "compact memory", "memory health", "memory stats".
---

# Memory Janitor

Keeps the `memory/` directory lean and healthy.

## Usage

```bash
# Full cleanup report + actions
node /root/openclaw/skills/memory-janitor/index.js

# Dry-run (report only, no changes)
node /root/openclaw/skills/memory-janitor/index.js --dry-run

# Only show stats
node /root/openclaw/skills/memory-janitor/index.js --stats-only
```

## What It Does

1. **GEP Prompt Cleanup**: Removes old `gep_prompt_*.txt` files, keeping the latest N (default: 3)
2. **Memory Graph Compaction**: Trims `memory_graph.jsonl` to the most recent N entries (default: 500)
3. **Stats Report**: Shows memory directory size breakdown by category
4. **Safety**: Never touches MEMORY.md, SOUL.md, IDENTITY.md, AGENTS.md, or daily notes from the last 7 days

## Configuration (Environment Variables)

- `JANITOR_KEEP_PROMPTS`: Number of GEP prompt files to keep (default: 3)
- `JANITOR_KEEP_GRAPH_LINES`: Max lines in memory_graph.jsonl (default: 500)
- `JANITOR_DRY_RUN`: Set to "true" for dry-run mode
