---
name: maintenance-runner
description: Unified system maintenance orchestrator. Runs memory-curator, memory-janitor, evo-compactor, and disk cleanup in a single command with a summary report. Use when asked for "run maintenance", "system cleanup", "housekeeping", "日常维护", or schedule via cron for automated weekly maintenance.
---

# maintenance-runner

One command to run all maintenance tasks and produce a combined report.

## Why

The system has multiple maintenance tools (memory-curator, memory-janitor, evo-compactor) that need to run periodically. Without orchestration, they fall behind — MEMORY.md went 27 days without an update despite having a curator tool.

## Usage

```bash
# Dry run — show what would happen
node /root/openclaw/skills/maintenance-runner/index.js

# Actually run all maintenance
node /root/openclaw/skills/maintenance-runner/index.js --run

# Run specific tasks only
node /root/openclaw/skills/maintenance-runner/index.js --run --only janitor,compactor

# JSON output
node /root/openclaw/skills/maintenance-runner/index.js --run --json
```

## Tasks Executed (in order)

| Task | Tool | What It Does |
|------|------|-------------|
| memory-janitor | `skills/memory-janitor` | Prunes GEP prompts, compacts memory graph, archives old daily notes, cleans session archives |
| evo-compactor | `skills/evo-compactor` | Compacts evolution data files |
| memory-curator check | `skills/memory-curator` | Reports MEMORY.md staleness |

## Cron Setup

```bash
# Recommended: weekly Sunday 03:00
# Add via OpenClaw cron with systemEvent:
# "Run maintenance: node /root/openclaw/skills/maintenance-runner/index.js --run"
```

## Output

Returns a structured summary with:
- Per-task status (ok/skipped/error)
- Bytes freed
- Files cleaned
- MEMORY.md staleness alert
- Total execution time
