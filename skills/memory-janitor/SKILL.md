---
name: memory-janitor
description: Automated cleanup and compaction of memory directory, session archives, and system-level disk cleanup. Cleans GEP prompts, deduplicates candidates.jsonl, compacts memory_graph.jsonl, archives old daily notes, purges old session archives, and optionally cleans npm cache, __pycache__, journal logs, and stale skill logs. Triggers on "clean memory", "compact memory", "memory health", "memory stats", "archive notes", "disk cleanup", "free disk space", "clean cache", "dedup candidates", "clean sessions".
---

# Memory Janitor

Keeps the `memory/` directory lean and healthy, with optional system-level disk cleanup.

## Usage

```bash
# Full memory cleanup (prompts + graph + daily notes + candidates dedup + session archives)
node /root/openclaw/skills/memory-janitor/index.js

# Dry-run (report only, no changes)
node /root/openclaw/skills/memory-janitor/index.js --dry-run

# Only show stats
node /root/openclaw/skills/memory-janitor/index.js --stats-only

# Only archive old daily notes
node /root/openclaw/skills/memory-janitor/index.js --archive-daily

# Only deduplicate GEP candidates.jsonl
node /root/openclaw/skills/memory-janitor/index.js --dedup-candidates

# Only clean session archives
node /root/openclaw/skills/memory-janitor/index.js --sessions

# Disk-level cleanup (npm cache, __pycache__, journal logs, stale logs)
node /root/openclaw/skills/memory-janitor/index.js --disk

# Dry-run disk cleanup
node /root/openclaw/skills/memory-janitor/index.js --disk --dry-run
```

## What It Does

### Memory Cleanup (default)
1. **GEP Prompt Cleanup**: Removes old `gep_prompt_*.txt` and `.json` files, keeping the latest N (default: 3)
2. **Memory Graph Compaction**: Trims `memory_graph.jsonl` to the most recent N entries (default: 500)
3. **Daily Notes Archive**: Archives daily notes older than N days (default: 14) into monthly files (`archive-daily-YYYY-MM.md`)
4. **GEP Candidates Dedup**: Deduplicates `candidates.jsonl` by ID, keeping latest entry per ID. Creates `.bak` backup before writing. Can compress 27K+ entries to ~16 unique entries (99.9% reduction).
5. **Session Archives Cleanup**: Purges old session archive files (default: keep 200 most recent, max 7 days old). Prevents unbounded growth of `~/.openclaw/agents/main/sessions/archive/` (can reach 200MB+).
6. **Stats Report**: Shows memory directory size breakdown by category

### Disk Cleanup (`--disk`)
1. **npm cache**: Cleans `/root/.npm` (can be 1-2GB)
2. **__pycache__**: Removes Python bytecode caches from skills (skips venvs)
3. **Journal logs**: Vacuums systemd journal to 50MB
4. **Stale skill logs**: Removes log files older than 7 days

## Configuration (Environment Variables)

- `JANITOR_KEEP_PROMPTS`: Number of GEP prompt files to keep (default: 3)
- `JANITOR_KEEP_GRAPH_LINES`: Max lines in memory_graph.jsonl (default: 500)
- `JANITOR_ARCHIVE_DAYS`: Archive daily notes older than this many days (default: 14)
- `JANITOR_SESSION_MAX_DAYS`: Delete session archives older than this many days (default: 7)
- `JANITOR_SESSION_MAX_COUNT`: Keep at most this many session archives (default: 200)
- `JANITOR_DRY_RUN`: Set to "true" for dry-run mode

## Safety

Never touches MEMORY.md, SOUL.md, IDENTITY.md, AGENTS.md, or other protected root files. Archived daily notes are preserved in monthly archive files before originals are removed. Candidates dedup creates a `.bak` backup before writing. Disk cleanup only removes caches and regenerable content.
