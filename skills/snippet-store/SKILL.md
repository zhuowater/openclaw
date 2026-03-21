---
name: snippet-store
description: Save, tag, search, and retrieve reusable code/text snippets — commands, API calls, code patterns, templates. Use when you want to save a useful command for later, search for a previously saved snippet, or manage your snippet library. Triggers on "save snippet", "save this command", "snippet search", "find that command I used", "snippet list", "记录命令", "保存片段".
---

# Snippet Store

A lightweight snippet manager for saving and retrieving reusable code, commands, and templates.

## Quick Start

```bash
# Save a snippet
node /root/openclaw/skills/snippet-store/index.js save "curl polymarket" \
  "curl -x socks5h://127.0.0.1:7880 https://clob.polymarket.com/auth/api-key" \
  "api,polymarket,proxy" "bash"

# Search snippets
node /root/openclaw/skills/snippet-store/index.js search "polymarket"

# List all
node /root/openclaw/skills/snippet-store/index.js list

# Stats
node /root/openclaw/skills/snippet-store/index.js stats
```

## Programmatic API

```js
const { save, search, list, get, remove, format, stats } = require('./skills/snippet-store');

// Save
const s = save({ title: 'HMAC sign', content: '...code...', tags: ['crypto','auth'], lang: 'js' });

// Search (fuzzy match on title, tags, description, content)
const results = search('hmac auth');
console.log(format(results));

// Filter by language or tags
const bashSnippets = search('', { lang: 'bash' });
const apiSnippets = search('', { tags: ['api'] });
```

## Storage

Snippets stored in `memory/snippets.jsonl` — one JSON object per line. Searchable via memory_search too.

## Fields

| Field | Required | Description |
|-------|----------|-------------|
| title | ✅ | Short descriptive title |
| content | ✅ | The snippet itself |
| tags | ❌ | Comma-separated tags for categorization |
| lang | ❌ | Language hint (bash, js, python, etc.) |
| description | ❌ | Longer explanation |
