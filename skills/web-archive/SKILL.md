---
name: web-archive
description: Local web page archive with stale-serve fallback. Caches fetched web pages locally for offline access, faster lookups, and resilience when external APIs (Brave Search, etc.) are down. Use when asked to "cache this page", "save this URL", "archive web page", "web cache", or when you need to serve stale content because an API is broken.
---

# web-archive

Local cache for web page content. Saves fetched pages so you can access them later without re-fetching, and serve stale content when external services fail.

## Why

- Brave Search API breaks frequently → cached results still available
- Intelligence pipelines fail (DNS, timeout) → stale data better than no data
- Repeated lookups waste API calls → serve from cache
- No external dependencies, pure Node.js

## CLI Usage

```bash
# Save content (pipe via stdin)
echo "page content here" | node skills/web-archive/index.js save "https://example.com" "Page Title"

# Retrieve cached content
node skills/web-archive/index.js get "https://example.com"

# Retrieve (reject stale)
node skills/web-archive/index.js get "https://example.com" --no-stale

# Search archive by URL or title keyword
node skills/web-archive/index.js search "polymarket"

# Show stats
node skills/web-archive/index.js stats

# Prune entries older than N hours (default: 168 = 7 days)
node skills/web-archive/index.js prune 720
```

## Programmatic Usage

```javascript
const { save, get, search, stats, prune } = require('./skills/web-archive');

// After web_fetch, cache the result
save('https://example.com/article', markdownContent, { title: 'Article Title' });

// Later, try cache first
const cached = get('https://example.com/article');
if (cached) {
  if (cached.stale) console.log('Using stale cache from', cached.ageHours, 'hours ago');
  return cached.content;
}

// Search by keyword
const results = search('polymarket');

// Cleanup
const removed = prune(720); // remove entries older than 30 days
```

## Integration Pattern

Best used as a fallback layer:
1. Try live fetch (web_fetch/web_search)
2. On failure → check web-archive for stale content
3. After successful fetch → save to archive for next time

## Configuration (Environment Variables)

| Variable | Default | Description |
|----------|---------|-------------|
| `WEB_ARCHIVE_MAX_AGE_HOURS` | 168 (7d) | Hours before content is considered stale |
| `WEB_ARCHIVE_MAX_ENTRIES` | 500 | Maximum cached pages |
| `WEB_ARCHIVE_MAX_SIZE_KB` | 200 | Max size per cached page |

Storage: `memory/web-archive/` (auto-created)
