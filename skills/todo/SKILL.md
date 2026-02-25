---
name: todo
description: Sync code TODOs/FIXMEs to task system. Use when you need to extract, track, or report on TODO comments scattered across codebases. NEW - Sync to GitHub Issues!
metadata: {"clawdbot":{"emoji":"✅","always":true}}
---

# Todo ✅

Extracts TODO/FIXME comments from source code and generates task reports. **Now supports syncing to GitHub Issues!**

## When to Use

- Extract all TODOs from a project
- Track technical debt items
- Generate task reports before sprint planning
- Monitor FIXME items across codebase
- **Sync TODOs to GitHub Issues automatically**

## Usage

### Basic Extraction

```javascript
const { scanDirectory, generateMarkdownReport } = require('./skills/todo');

// Scan workspace
const todos = scanDirectory('/root/openclaw');

// Generate report
const report = generateMarkdownReport(todos);
console.log(report);
```

### 🆕 Sync to GitHub Issues

```javascript
const { scanDirectory, syncToGitHub } = require('./skills/todo');

const todos = scanDirectory('/path/to/project');

// Dry run (preview)
await syncToGitHub(todos, {
  repo: 'owner/repo',
  token: process.env.GITHUB_TOKEN,
  dryRun: true
});

// Actually create issues
await syncToGitHub(todos, {
  repo: 'owner/repo',
  token: process.env.GITHUB_TOKEN,
  dryRun: false
});
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

## GitHub Sync Features

- Automatically creates GitHub Issues from TODO comments
- Includes file path and line number in issue body
- Applies appropriate labels (todo/fixme)
- Dry-run mode for safe preview
- Prevents duplicates via title matching

## Security Note

Never commit GitHub tokens to code. Use environment variables:
```bash
export GITHUB_TOKEN=ghp_your_token_here
```
