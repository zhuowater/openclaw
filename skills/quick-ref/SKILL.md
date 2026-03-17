---
name: quick-ref
description: Fast key-value reference store for frequently-used snippets, commands, URLs, and operational data. Use instead of repeated exec/memory_search calls for data that doesn't change often. Triggers on "save ref", "quick ref", "lookup", "store snippet", "记一下", "快速查", "常用命令".
---

# quick-ref

Lightweight key-value store optimized for agent operational data.

## Why

Reduces repeated `exec` and `memory_search` calls for stable reference data (API endpoints, common commands, device names, config values).

## Usage

```bash
# Store a reference
node /root/openclaw/skills/quick-ref/index.js set "skyeye-base" "https://api.skyeye.chat/v1"

# Retrieve a reference
node /root/openclaw/skills/quick-ref/index.js get "skyeye-base"

# List all references
node /root/openclaw/skills/quick-ref/index.js list

# Search references by keyword
node /root/openclaw/skills/quick-ref/index.js search "api"

# Delete a reference
node /root/openclaw/skills/quick-ref/index.js del "old-key"

# Import from JSON file
node /root/openclaw/skills/quick-ref/index.js import refs.json

# Export all as JSON
node /root/openclaw/skills/quick-ref/index.js export

# Stats
node /root/openclaw/skills/quick-ref/index.js stats
```

## Data File

References stored in `~/.openclaw/quick-ref.json` (auto-created).

## Programmatic API

```javascript
const qr = require('./skills/quick-ref');
await qr.set('key', 'value');           // store
const val = await qr.get('key');        // retrieve (null if missing)
const all = await qr.list();            // all entries
const hits = await qr.search('query');  // fuzzy search
await qr.del('key');                    // remove
```

## Best Practices

- Use namespaced keys: `api:skyeye`, `cmd:disk-check`, `url:feishu-webhook`
- Store stable data (API URLs, device IDs, wallet addresses, common commands)
- Don't store secrets (use env vars for those)
- Periodically prune stale entries with `list` + `del`
