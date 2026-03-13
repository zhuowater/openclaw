---
name: session-analyzer
description: Analyze OpenClaw session logs for usage patterns, tool call frequency, error rates, session duration, and message counts. Use when asked about "session stats", "tool usage", "how many messages", "error rate", "session duration", "which cron uses most", or for optimizing automated tasks.
---

# Session Analyzer

Parses session JSONL logs to generate actionable usage analytics.

## CLI Usage

```bash
# Full report (last 24h)
node skills/session-analyzer/index.js

# Last N days
node skills/session-analyzer/index.js --days 7

# JSON output
node skills/session-analyzer/index.js --json

# Filter by session type (cron, spawn, interactive)
node skills/session-analyzer/index.js --type cron

# Top tool callers
node skills/session-analyzer/index.js --top-tools

# Error summary
node skills/session-analyzer/index.js --errors
```

## Programmatic Usage

```javascript
const { analyze, topTools, errorSummary } = require('./skills/session-analyzer');

// Full analysis
const report = await analyze({ days: 7 });
// { sessions, totalMessages, toolCalls, errors, avgDuration, byType }

// Top tools by frequency
const tools = await topTools({ days: 3 });
// [{ tool, count, errorRate }, ...]

// Error patterns
const errs = await errorSummary({ days: 7 });
// [{ pattern, count, lastSeen, sessions }, ...]
```

## What It Reports

- **Session counts**: total, by type (cron/spawn/interactive), active vs deleted
- **Message volume**: messages per session, per day
- **Tool usage**: frequency per tool, avg calls per session
- **Error rate**: tool errors, patterns, which sessions fail most
- **Duration**: estimated session lifetimes from first/last message timestamps
- **Cron efficiency**: which cron jobs generate most messages/tool calls
