---
name: runtime-integrity
description: Runtime file integrity monitor for OpenClaw. Detects unauthorized modifications to critical files (configs, skills, system files) by maintaining SHA-256 hash baselines and comparing at runtime. Use when you need to verify system integrity, detect tampering, or audit file changes. Triggers on "integrity check", "file tampering", "verify integrity", "hash check", "security baseline".
---

# Runtime Integrity

Monitors critical OpenClaw files for unauthorized changes using SHA-256 hash baselines.

## Usage

```bash
# Initialize baseline (first run or after known-good state)
node /root/openclaw/skills/runtime-integrity/index.js baseline

# Check integrity against baseline
node /root/openclaw/skills/runtime-integrity/index.js check

# JSON output
node /root/openclaw/skills/runtime-integrity/index.js check --json

# Check specific category only
node /root/openclaw/skills/runtime-integrity/index.js check --category config
node /root/openclaw/skills/runtime-integrity/index.js check --category skills
node /root/openclaw/skills/runtime-integrity/index.js check --category system

# Show baseline info
node /root/openclaw/skills/runtime-integrity/index.js status
```

## What It Monitors

### Config Files
- `openclaw.json`, `package.json`, `.env`
- Workspace files: `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `USER.md`

### Skill Entry Points
- All `skills/*/index.js` files (detects code injection into skills)
- All `skills/*/SKILL.md` files (detects description hijacking)

### System Files
- Key evolver files (prevents self-modification attacks)
- Common/shared modules

## Output

- ✅ PASS: File matches baseline hash
- ⚠️ MODIFIED: File changed since baseline
- ❌ MISSING: File in baseline but no longer exists
- 🆕 NEW: File exists but not in baseline

## Integration

Can be called from heartbeat or cron for continuous monitoring.
Baseline stored at `memory/integrity-baseline.json`.
