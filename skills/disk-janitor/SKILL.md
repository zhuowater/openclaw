---
name: disk-janitor
description: Automated disk space cleanup for OpenClaw workspaces. Safely removes stale temp files, caches, old session archives, and GEP prompts. Use when disk usage is high (>80%), during heartbeat checks, or when asked to free disk space.
---

# disk-janitor

Reclaims disk space by cleaning safe, well-known waste targets.

## Usage

```bash
# Dry run (report what would be cleaned, no deletions)
node /root/openclaw/skills/disk-janitor/index.js

# Actually clean
node /root/openclaw/skills/disk-janitor/index.js --clean

# JSON output
node /root/openclaw/skills/disk-janitor/index.js --clean --json
```

## What It Cleans

| Target | Description | Default Max Age |
|--------|-------------|-----------------|
| `/tmp/*` | Temp files older than 2 days | 2 days |
| `~/.cache/` sub-dirs | npm, pip, huggingface caches | 7 days |
| `~/.npm/_cacache` | npm cache tarballs | 7 days |
| Session archives | `.openclaw/agents/main/sessions/archive/*.jsonl` older than 30 days | 30 days |
| GEP prompts | `memory/evolution/gep_prompt_*.txt` older than 7 days | 7 days |
| Stale media | `.openclaw/media/inbound/*` older than 7 days | 7 days |

## Safety

- **Never deletes**: MEMORY.md, SOUL.md, IDENTITY.md, AGENTS.md, active sessions, .git, node_modules, skills source
- Dry-run by default (must pass `--clean` to actually delete)
- Reports bytes freed per category
- Logs all deletions to stdout

## Programmatic

```javascript
const { scan, clean } = require('./skills/disk-janitor');
const report = await scan();   // dry-run report
const result = await clean();  // actually clean
```
