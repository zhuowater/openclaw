---
name: skill-health-monitor
description: Monitor health of installed skills. Detects broken skills, missing SKILL.md, incomplete dependencies. Use when you need to audit skill quality, identify failing skills, or maintain system stability. Triggers on "check skills", "skill audit", "broken skills", "skill health".
---

# Skill Health Monitor

Automated health monitoring for installed Clawdbot skills.

## What It Does

Scans all installed skills in `skills/` and checks:
- **Loadability**: Can `index.js` be required without errors?
- **Structure**: Does `SKILL.md` exist with valid YAML frontmatter?
- **Dependencies**: Is `package.json` present and parseable?

## When to Use

- Regular maintenance (weekly/monthly skill audit)
- After bulk skill installations
- When suspecting broken skills causing issues
- Before critical deployments

## Usage

```bash
# Full health scan
node /root/openclaw/skills/skill-health-monitor/index.js

# Or import programmatically
const { scanAllSkills } = require('./skills/skill-health-monitor');
const report = await scanAllSkills();
```

## Output

JSON report with:
- Total skills count
- Healthy vs broken skills
- Detailed issues per skill
- Actionable recommendations

## Implementation

See `scripts/scan.js` for core scanning logic.
