---
name: quick-brief
description: Rapid situational awareness briefing on any topic. Searches web, memory files, and optional X/Twitter for a concise 30-second brief. Use when asked "brief me on X", "what's happening with Y", "quick update on Z", "情况简报", "快速了解", or when you need fast context before a decision (e.g., trading, incident response). Different from deep-research (lightweight, <30s) and news-summary (on-demand, any topic).
---

# Quick Brief

Instant situational awareness on any topic. Pulls from multiple sources, synthesizes into a concise actionable briefing.

## When To Use

- "Brief me on the Iran situation"
- "Quick update on BTC"
- "What's the latest on CVE-2026-XXXXX?"
- Before making a Polymarket trade
- During an incident — fast context gathering

## Usage

### CLI
```bash
# Basic brief
node /root/openclaw/skills/quick-brief/index.js "Iran war ceasefire"

# With options
node /root/openclaw/skills/quick-brief/index.js "topic" --sources web,memory,x --depth shallow|normal --format text|json

# Memory-only (no web, fastest)
node /root/openclaw/skills/quick-brief/index.js "polymarket strategy" --sources memory
```

### Programmatic
```javascript
const { brief } = require('./skills/quick-brief');
const result = await brief('Iran war', { sources: ['web', 'memory'], depth: 'normal' });
console.log(result.summary);    // 3-5 sentence summary
console.log(result.keyFacts);   // bullet points
console.log(result.sentiment);  // positive/negative/neutral/mixed
console.log(result.confidence); // 0-1 confidence in the brief
console.log(result.sources);    // source attribution
```

## Output Format

```
📋 BRIEF: [Topic]
━━━━━━━━━━━━━━━━━━━━━━
📌 Summary: [3-5 sentences]

🔑 Key Facts:
• [fact 1]
• [fact 2]
• [fact 3]

📊 Sentiment: [positive/negative/neutral/mixed]
🎯 Confidence: [high/medium/low]
📡 Sources: [web: N, memory: N, x: N]
⏱️ Generated in: [Xs]
━━━━━━━━━━━━━━━━━━━━━━
```

## Architecture

1. **Parallel source fetch** — web search + memory scan + optional X search run simultaneously
2. **Dedup & merge** — removes redundant info across sources
3. **Synthesize** — extracts key facts, assesses sentiment, scores confidence
4. **Format** — produces human-readable brief or structured JSON

## Integration with Agent Workflow

The agent can call `brief()` before any decision-making step:
- Before Polymarket trades: `brief("Iran ceasefire probability")`
- During security incidents: `brief("CVE-2026-XXXXX exploitation")`
- For heartbeat intelligence: `brief("cybersecurity news last 2 hours")`
