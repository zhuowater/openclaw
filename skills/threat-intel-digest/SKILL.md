---
name: threat-intel-digest
description: >
  Threat intelligence digest generator. Use when you need to: (1) parse and structure
  the insight library from MEMORY.md, (2) generate a threat intelligence briefing
  from existing insights + live web data, (3) track how threat trends evolve over time,
  (4) cross-reference new security events against known patterns. Triggers on: threat briefing,
  security digest, intel report, insight analysis, threat landscape, security trends.
---

# Threat Intel Digest

**Turn scattered security insights into actionable threat intelligence.**

## Overview

This skill bridges the gap between raw security insights (stored in MEMORY.md) and
structured, actionable threat intelligence. It parses your insight library, fetches
fresh threat data from the web, cross-references patterns, and produces briefings
with priority scoring and trend analysis.

## Usage

### 1. Generate a Full Briefing

```javascript
const { generateBriefing } = require('./skills/threat-intel-digest');
const briefing = await generateBriefing({
  memoryPath: 'MEMORY.md',       // Path to insight source
  outputPath: 'memory/',          // Where to save the report
  fetchLive: true,                // Fetch latest threat intel from web
  format: 'markdown'              // Output format: markdown | json
});
```

### 2. Parse Insights Only

```javascript
const { parseInsights } = require('./skills/threat-intel-digest');
const insights = await parseInsights('MEMORY.md');
// Returns structured array of insight objects with metadata
```

### 3. Trend Analysis

```javascript
const { analyzeTrends } = require('./skills/threat-intel-digest');
const trends = await analyzeTrends({
  memoryPath: 'MEMORY.md',
  previousReports: 'memory/threat-reports/'
});
```

### 4. CLI Usage

```bash
# Generate briefing
node skills/threat-intel-digest/index.js briefing

# Parse insights only
node skills/threat-intel-digest/index.js parse

# Quick threat landscape summary
node skills/threat-intel-digest/index.js landscape
```

## Output Structure

Each briefing includes:
- **Executive Summary**: Top 3 threats, overall risk level
- **Insight Matrix**: All insights categorized by domain, severity, trend direction
- **New Developments**: Fresh intel cross-referenced with existing insights
- **Trend Analysis**: Which threats are escalating/declining
- **Action Items**: Recommended responses prioritized by urgency

## Insight Categories

| Category | Description |
|----------|-------------|
| `ai-attack` | AI-native attack vectors (HONESTCUE, React2Shell, etc.) |
| `ai-ecosystem` | Agent ecosystem security (MCP, A2A, prompt injection) |
| `supply-chain` | Software/AI supply chain attacks |
| `infrastructure` | Legacy/infra vulnerability patterns |
| `geopolitical` | Geo-cyber threat landscape |
| `industry` | AI industry dynamics (IP, distillation, etc.) |

## Integration

Works with:
- `topic-monitor`: Feed monitored topics into briefing context
- `deep-research`: Trigger deep dives on escalating threats
- `news-summary`: Incorporate latest news into intel picture
