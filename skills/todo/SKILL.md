---
name: todo
description: Sync code TODOs/FIXMEs to task system. Use when you need to extract, track, or report on TODO comments scattered across codebases.
metadata: {"clawdbot":{"emoji":"✅","always":true}}
---

# Todo ✅

Extracts TODO/FIXME comments from source code and generates task reports.

## When to Use

- Extract all TODOs from a project
- Track technical debt items
- Generate task reports before sprint planning
- Monitor FIXME items across codebase

## Usage

```javascript
const { scanDirectory, generateMarkdownReport } = require('./skills/todo');

// Scan workspace
const todos = scanDirectory('/root/openclaw');

// Generate report
const report = generateMarkdownReport(todos);
console.log(report);
```

## CLI Usage

```bash
node skills/todo/index.js /path/to/project
# Outputs: todos.json + todos.md
```

## Output Format

- **todos.json** — Structured data for programmatic use
- **todos.md** — Human-readable report grouped by type (TODO/FIXME)

## Supported Languages

JavaScript, TypeScript, Python, Shell, Markdown (// TODO: style comments)
