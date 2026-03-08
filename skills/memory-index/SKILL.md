---
name: memory-index
description: Fast keyword index for memory files. Builds inverted index over memory/*.md + MEMORY.md for near-instant keyword lookups without scanning all files. Use when searching memory for specific terms, topics, dates, or names. Rebuild after major memory changes.
---

# memory-index

**Purpose**: Eliminate full-file-scan bottleneck for memory lookups by maintaining an inverted keyword index.

## Why

With 47+ memory files totaling 3MB+, every `memory_search` or manual grep scans all files. This skill builds a persistent keyword index that maps terms → files + line numbers, enabling O(1) lookups.

## CLI Usage

```bash
# Build/rebuild index (run after memory changes)
node skills/memory-index/index.js build

# Search for keywords (returns matching files + lines + context)
node skills/memory-index/index.js search "polymarket trading"

# Show index stats
node skills/memory-index/index.js stats
```

## Programmatic Usage

```javascript
const { buildIndex, search, stats } = require('./skills/memory-index');

// Build index
const buildResult = await buildIndex();
// { indexed: 47, terms: 12450, elapsed: '0.12s' }

// Search (returns top matches with context)
const results = await search('iran war khamenei');
// [{ file, line, score, context }, ...]

// Stats
const s = await stats();
// { files: 47, terms: 12450, sizeKB: 85, lastBuild: '2026-03-08T00:00:00Z' }
```

## How It Works

1. **Build**: Tokenizes all memory markdown files, strips stop words, builds inverted index: `term → [{file, line, freq}]`
2. **Search**: Splits query into tokens, intersects/scores against index using TF-IDF-like scoring
3. **Cache**: Index persists to `memory/evolution/.memory-index.json`, rebuilds only when files change (mtime check)

## Performance

- **Build**: ~100-200ms for 47 files / 3MB
- **Search**: <5ms per query (vs ~50ms grep over all files)
- **Index size**: ~80-120KB JSON
