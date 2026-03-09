---
name: web-search-fallback
description: Unified search router with automatic fallback. Use when web_search (Brave) returns missing_brave_api_key error. Auto-routes to Grok web_search (English) or Baidu AI Search (Chinese) as fallback. No additional API keys needed beyond SKYEYE_API_KEY.
---

# Web Search Fallback

Automatic search routing when Brave Search API is unavailable.

## When to Use

- `web_search` returns `missing_brave_api_key` error
- Need English web search without Brave → uses Grok server-side web_search
- Need Chinese web search → uses Baidu AI Search via mcporter

## Fallback Chain

| Priority | Backend | Best For | Requires |
|----------|---------|----------|----------|
| 1 | Grok web_search | English queries | SKYEYE_API_KEY |
| 2 | Baidu AI Search | Chinese queries | mcporter configured |

Auto-detection: Chinese text → Baidu first, English → Grok first.

## CLI Usage

```bash
# Auto-detect language
node /root/openclaw/skills/web-search-fallback/index.js "cybersecurity news"

# Force backend
node /root/openclaw/skills/web-search-fallback/index.js "网络安全" --prefer baidu
node /root/openclaw/skills/web-search-fallback/index.js "AI safety" --prefer grok

# Options
node /root/openclaw/skills/web-search-fallback/index.js "query" --count 5 --lang zh
```

## From Code

```javascript
const { search } = require('/root/openclaw/skills/web-search-fallback');
const r = await search('cybersecurity news', { count: 5 });
// { ok: true, results: [{title, url, description}], source: 'grok-web-search', query }
```

## Output

```json
{
  "ok": true,
  "results": [{"title": "...", "url": "...", "description": "..."}],
  "query": "original query",
  "source": "grok-web-search"
}
```
