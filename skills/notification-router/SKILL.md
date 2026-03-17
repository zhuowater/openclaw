---
name: notification-router
description: Smart notification routing and escalation based on event severity. Use when you need to decide HOW to notify the user (feishu message, feishu urgent buzz, or phone call) based on event importance. Triggers on "notify user", "alert", "escalate", "urgent notification", or when any monitoring skill detects a critical event.
---

# Notification Router

Routes notifications to the appropriate channel based on severity scoring.

## Severity Levels

| Level | Score | Channel | Example |
|-------|-------|---------|---------|
| LOW | 0-30 | Feishu message (next heartbeat) | Routine updates, daily digests |
| MEDIUM | 31-60 | Feishu message (immediate) | Market moves >5%, new CVE published |
| HIGH | 61-80 | Feishu urgent buzz (app) | Portfolio loss >15%, active security incident |
| CRITICAL | 81-100 | Phone call via Twilio | System compromise, >30% portfolio crash, user-specified emergencies |

## Usage

```javascript
const { route, score, LEVELS } = require('./skills/notification-router');

// Score an event
const severity = score({
  type: 'market',           // market | security | system | custom
  description: 'BTC dropped 20% in 1 hour',
  indicators: { pctChange: -20, timeframeMin: 60 }
});
// => { level: 'HIGH', score: 75, channel: 'feishu_urgent' }

// Route a notification (actually sends it)
await route({
  title: 'Portfolio Alert',
  body: 'BTC dropped 20%',
  severity: 'HIGH',          // or pass score result
  dryRun: false
});
```

### CLI

```bash
# Score an event
node /root/openclaw/skills/notification-router/index.js score --type=market --desc="BTC -20%" --pct=-20

# Send with auto-scoring
node /root/openclaw/skills/notification-router/index.js send --type=security --desc="CVE-2026-99999 CVSS 10.0 actively exploited" --title="CRITICAL CVE"

# Dry run (shows what would happen)
node /root/openclaw/skills/notification-router/index.js send --type=system --desc="Disk 95% full" --dry-run
```

## Scoring Rules

### Market Events
- Price change >30% → CRITICAL (90)
- Price change >15% → HIGH (70)
- Price change >5% → MEDIUM (50)
- Portfolio loss >$500 → +20 bonus

### Security Events
- CVSS ≥9.0 + actively exploited → CRITICAL (95)
- CVSS ≥9.0 → HIGH (75)
- CVSS ≥7.0 → MEDIUM (55)
- Affects our systems → +15 bonus

### System Events
- Service down → HIGH (70)
- Disk >95% → HIGH (65)
- Disk >90% → MEDIUM (45)
- Memory >90% → MEDIUM (50)

### Custom Events
- User explicitly says "urgent" → HIGH (70)
- User explicitly says "critical"/"emergency" → CRITICAL (85)

## Configuration

Reads from USER.md for phone number and preferences. Defaults:
- Phone: from USER.md (Twilio voice)
- Feishu: current conversation
- Quiet hours: 23:00-08:00 (downgrades non-CRITICAL by one level)
