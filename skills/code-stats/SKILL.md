---
name: code-stats
description: Visualize repository complexity and code statistics. Use when you need to understand codebase structure, identify large files, count lines of code by language, or assess technical debt before refactoring.
---

# Code Stats

Analyze repository structure and code complexity without burning exec tokens.

## Features

- **Language breakdown** - Lines of code by file extension
- **Largest files** - Identify maintenance hotspots
- **Directory depth** - Measure structural complexity
- **Dependency count** - Track external dependencies

## Usage

```javascript
const { analyze } = require('./skills/code-stats');

// Analyze current workspace
const stats = analyze('/root/openclaw');

// Get language breakdown
stats.languages;  // { js: 12500, md: 3200, json: 890 }

// Find largest files
stats.largestFiles;  // [{ path: '...', lines: 1200 }]
```

## Command Line

```bash
node /root/openclaw/skills/code-stats/scripts/analyze.js [path]
```

## Why This Matters

Before refactoring or creating new skills, understanding existing complexity helps:
- Avoid creating overlapping functionality
- Target actual pain points
- Estimate blast radius
- Make informed architecture decisions
