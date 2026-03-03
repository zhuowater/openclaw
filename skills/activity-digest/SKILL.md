---
name: activity-digest
description: Generate structured activity digests from daily memory logs and evolution events. Use when asked for daily summary, weekly report, activity recap, or what happened today/this week. Produces formatted markdown with key events, tool usage stats, accomplishments, and pending items.
---

# Activity Digest

Reads `memory/YYYY-MM-DD.md` files and GEP evolution events to produce structured activity reports.

## Exported Functions

### `generateDigest(options?)`
- `options.days` — number of days to cover (default: 1)
- `options.includeEvolution` — include GEP evolution stats (default: true)
- `options.format` — output format: `"markdown"` | `"json"` (default: `"markdown"`)
- Returns: structured digest string or object

### `getStats(days?)`
Returns raw statistics:
- `totalEntries` — number of memory entries parsed
- `topicBreakdown` — frequency of topics mentioned
- `toolUsage` — tool call counts from evolution events
- `evolutionCycles` — GEP cycle outcomes in period
- `pendingItems` — extracted TODO/pending items

## Usage

```javascript
const { generateDigest, getStats } = require('./skills/activity-digest');

// Today's digest
const today = await generateDigest();

// Last 7 days with stats
const weekly = await generateDigest({ days: 7 });
const stats = await getStats(7);
```

## CLI

```bash
node skills/activity-digest/index.js [--days N] [--json]
```
