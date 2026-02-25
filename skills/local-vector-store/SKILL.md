---
name: local-vector-store
description: Local semantic search for memory files using sentence-transformers. Use when memory_search fails due to missing API keys or when you need offline semantic search capability. Searches MEMORY.md and memory/*.md files.
---

# Local Vector Store

Provides local semantic search capability without requiring external API keys.

## Installation

```bash
cd /root/openclaw/skills/local-vector-store
pip3 install sentence-transformers numpy scikit-learn --break-system-packages
```

## Usage

Search memory files:
```bash
node /root/openclaw/skills/local-vector-store/index.js search "your query here"
```

Build/update index:
```bash
node /root/openclaw/skills/local-vector-store/index.js index
```

## How It Works

1. Extracts text from MEMORY.md and memory/*.md
2. Uses sentence-transformers (all-MiniLM-L6-v2) for embeddings
3. Stores vectors locally in .vector-index/
4. Returns top-K results with cosine similarity scores

## Dependencies

- Python 3 with sentence-transformers, numpy, scikit-learn
- Works offline after model download
