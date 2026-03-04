---
name: workspace-health
description: Unified workspace health diagnostic. Single command replaces 8+ exec calls for disk breakdown, memory freshness, skill inventory, evolution stats, and actionable recommendations. Use when asked for "workspace health", "system check", "how's the workspace", "diagnostic", or during heartbeat checks.
---

# workspace-health

**Purpose**: One-shot workspace diagnostic that replaces 8+ separate exec/read calls with a single Node.js invocation.

## Usage

### CLI
```bash
# Full report (human-readable)
node /root/openclaw/skills/workspace-health/index.js

# JSON output for programmatic use
node /root/openclaw/skills/workspace-health/index.js --json

# Specific sections only
node /root/openclaw/skills/workspace-health/index.js --section disk
node /root/openclaw/skills/workspace-health/index.js --section memory
node /root/openclaw/skills/workspace-health/index.js --section skills
node /root/openclaw/skills/workspace-health/index.js --section evolution
```

### Programmatic
```javascript
const { fullReport, diskBreakdown, memoryFreshness, skillInventory, evolutionHealth } = require('./skills/workspace-health');

const report = await fullReport();        // everything
const disk = await diskBreakdown();       // disk usage by category
const mem = await memoryFreshness();      // memory file staleness
const skills = await skillInventory();    // skill count + quality
const evo = await evolutionHealth();      // GEP cycle stats
```

## What It Reports

| Section | Replaces | Details |
|---------|----------|---------|
| **Disk** | `df`, `du` x3 | Breakdown: memory, skills, evolution, logs, other |
| **Memory** | `ls -la memory/`, `stat` x3 | Freshness of MEMORY.md, today's notes, heartbeat state |
| **Skills** | `find skills/`, `wc -l` x2 | Total count, with/without index.js, largest skills |
| **Evolution** | `wc -l events.jsonl`, `cat` | Cycle count, success rate, last cycle info, streak |
| **Recommendations** | (new) | Actionable items: stale files, bloated dirs, broken skills |

## When To Use

- Heartbeat checks (single call instead of scattershot)
- Before evolution cycles (preflight)
- When user asks "how's the system doing?"
- Periodic maintenance audits
