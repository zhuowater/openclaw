---
name: skill-gap-analyzer
description: Analyze session logs to identify unmet user needs and capability gaps. Scans recent conversations for tool usage patterns, failed operations, manual workarounds, and user requests that required multiple exec calls. Use when asked "what skills am I missing", "capability gaps", "skill audit", "what should I build next", "evolution suggestions", or during stagnation-breaking innovation cycles.
---

# Skill Gap Analyzer

Identifies what capabilities the agent lacks by analyzing real usage patterns.

## Usage

```bash
# Full gap analysis (scans last 7 days of sessions)
node /root/openclaw/skills/skill-gap-analyzer/index.js

# Scan specific time range
node /root/openclaw/skills/skill-gap-analyzer/index.js --days 14

# JSON output
node /root/openclaw/skills/skill-gap-analyzer/index.js --json

# Only show top N gaps
node /root/openclaw/skills/skill-gap-analyzer/index.js --top 5
```

## What It Analyzes

1. **Tool usage frequency** — Which tools are called most? Excessive `exec` calls suggest missing skills
2. **Repeated command patterns** — Same shell commands run 3+ times = automation opportunity
3. **Failed operations** — Tool errors and retries indicate brittle integrations
4. **Manual workarounds** — Multi-step exec sequences that should be a single skill
5. **Existing skill coverage** — Maps user intents to available skills, finds unmapped areas

## Output

Reports gap candidates ranked by frequency and impact:
- Candidate description
- Evidence (session excerpts)
- Suggested skill name
- Estimated complexity (low/medium/high)

## Integration

The evolver's Innovation Catalyst can consume this output to make data-driven skill creation decisions instead of guessing.
