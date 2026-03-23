---
name: evo-pre-flight
description: Pre-flight checks and auto-maintenance before evolution cycles. Compacts stale data, validates evolution state integrity, and ensures clean starting conditions. Use before running evolver or as a cron pre-step. Triggers on "pre-flight", "evolution prep", "evo check".
---

# evo-pre-flight

Runs automatic maintenance checks before an evolution cycle to ensure clean, fast execution.

## What It Does

1. **Auto-compact**: Runs evo-compactor if memory_graph > 1MB or prompts > 5 files
2. **State validation**: Checks evolution_state.json and solidify_state.json for corruption
3. **Stale data detection**: Flags heartbeat-state entries older than 7 days
4. **Disk check**: Warns if workspace disk usage > 80%
5. **Gene/Capsule integrity**: Validates JSON syntax of genes.json and capsules.json

## Usage

```bash
# Check + auto-fix
node /root/openclaw/skills/evo-pre-flight/index.js

# Check only (no fixes applied)
node /root/openclaw/skills/evo-pre-flight/index.js --check-only

# JSON output
node /root/openclaw/skills/evo-pre-flight/index.js --json
```

## Integration

Can be called before `node skills/evolver/index.js run` to ensure clean state.
