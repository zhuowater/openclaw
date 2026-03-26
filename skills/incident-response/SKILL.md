---
name: incident-response
description: Security incident response playbook engine. Use when a security event occurs — breach detected, suspicious activity, vulnerability exploitation, anomalous behavior, or when asked to "investigate", "triage", "respond to incident", "安全事件", "应急响应", "事件处置". Provides structured NIST-aligned incident response with automated evidence collection, severity scoring, containment recommendations, and post-incident reporting.
---

# Incident Response

Structured security incident response following NIST SP 800-61 phases: Detect → Triage → Contain → Eradicate → Recover → Lessons Learned.

## Quick Start

```bash
# Start new incident
node skills/incident-response/index.js new --title "Suspicious login from unknown IP" --severity medium

# List active incidents
node skills/incident-response/index.js list

# Add evidence to incident
node skills/incident-response/index.js evidence --id INC-001 --type log --note "Auth log shows 50 failed attempts"

# Update incident phase
node skills/incident-response/index.js phase --id INC-001 --phase containment

# Generate incident report
node skills/incident-response/index.js report --id INC-001

# Close incident with lessons learned
node skills/incident-response/index.js close --id INC-001 --lesson "Enable rate limiting on auth endpoint"
```

## Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| critical | Active breach, data exfil, RCE | Immediate |
| high | Exploit attempt, suspicious access | < 1 hour |
| medium | Anomalous behavior, policy violation | < 4 hours |
| low | Informational, recon activity | < 24 hours |

## Incident Lifecycle

1. **Detection** — Initial alert or report
2. **Triage** — Severity assessment, scope determination
3. **Containment** — Stop the bleeding (short-term + long-term)
4. **Eradication** — Remove threat, patch vulnerability
5. **Recovery** — Restore services, verify clean
6. **Lessons Learned** — Post-incident review, update defenses

## Integration

- Stores incidents in `memory/incidents/` as JSON
- Links to MEMORY.md for cross-referencing
- Can trigger notifications via Twilio/Feishu for critical incidents
- Timeline entries auto-append to daily memory notes
