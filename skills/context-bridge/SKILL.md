---
name: context-bridge
description: Generate compressed context summaries for sub-agent onboarding and session handoffs. Use when spawning sub-agents that need workspace context, when asked to "summarize context", "create briefing", "onboard agent", or when starting a complex multi-agent task that requires shared situational awareness. Reduces 5-8 exec/read calls to a single invocation.
---

# context-bridge

Generates a compressed, structured context package from the current workspace state. Designed to give sub-agents or new sessions everything they need to be productive immediately.

## Usage

```bash
# Full context briefing (human-readable markdown)
node /root/openclaw/skills/context-bridge/index.js

# JSON output for programmatic use
node /root/openclaw/skills/context-bridge/index.js --json

# Specific sections only
node /root/openclaw/skills/context-bridge/index.js --section memory
node /root/openclaw/skills/context-bridge/index.js --section tasks
node /root/openclaw/skills/context-bridge/index.js --section system
node /root/openclaw/skills/context-bridge/index.js --section skills

# Compact mode (under 2000 chars, ideal for sub-agent task prompts)
node /root/openclaw/skills/context-bridge/index.js --compact

# Write to file
node /root/openclaw/skills/context-bridge/index.js --out /tmp/briefing.md
```

## Sections

| Section | What It Includes |
|---------|-----------------|
| `memory` | Active items from MEMORY.md, today's memory notes, pending TODOs |
| `tasks` | Active cron jobs, pending reminders, heartbeat status |
| `system` | Disk/RAM/uptime, node version, installed integrations |
| `skills` | Available skill inventory with categories |
| `identity` | Agent identity, soul summary, user preferences |

## Programmatic API

```javascript
const { generateBriefing, getSection } = require('./skills/context-bridge');

// Full briefing
const briefing = await generateBriefing();

// Single section
const memCtx = await getSection('memory');

// Compact string for sub-agent prompts
const compact = await generateBriefing({ compact: true });
```

## Why

Sub-agents spawned via `sessions_spawn` often lack workspace context and waste cycles rediscovering it via multiple exec/read calls. This skill packages all relevant context into one call, saving ~60% of onboarding token cost.
