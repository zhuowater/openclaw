---
name: commit-review
description: Automated pre-commit code review with security scanning and risk scoring. Use when asked to "review staged changes", "check before commit", "pre-commit review", "代码审查", "提交前检查", or during evolution cycles before git commit. Analyzes diffs for security issues, code smells, and blast radius.
---

# commit-review

Local pre-commit code review that scans staged git changes for:
- **Security issues**: hardcoded secrets, dangerous patterns, injection risks
- **Code smells**: large functions, TODO debris, console.log left in
- **Risk scoring**: blast radius estimation, change complexity
- **Best practices**: missing error handling, unescaped user input

## Usage

```bash
# Review staged changes (default: /root/openclaw)
node /root/openclaw/skills/commit-review/index.js

# Review specific repo
node /root/openclaw/skills/commit-review/index.js /path/to/repo

# JSON output
node /root/openclaw/skills/commit-review/index.js --json

# Review unstaged changes instead
node /root/openclaw/skills/commit-review/index.js --unstaged

# Review last N commits
node /root/openclaw/skills/commit-review/index.js --last 3
```

## Programmatic

```js
const { review, formatReport } = require('./skills/commit-review');

const result = review({ repoPath: '/root/openclaw', staged: true });
console.log(formatReport(result));
// result.score: 0-100 (higher = safer)
// result.issues: array of { severity, category, file, line, message }
// result.summary: human-readable summary
```

## Output

```
┌─────────────────────────────────────┐
│ Commit Review: 3 files, +45 -12    │
│ Risk Score: 72/100 (MODERATE)       │
├─────────────────────────────────────┤
│ ⚠ WARN  secrets.js:14  Possible hardcoded token │
│ ℹ INFO  utils.js:30    console.log in production │
│ ✓ OK    index.js       No issues found           │
└─────────────────────────────────────┘
```

## Security Patterns Detected

- API keys, tokens, passwords in code
- `eval()`, `Function()`, `child_process.exec` with user input
- SQL string concatenation
- Unvalidated file paths (path traversal)
- Disabled TLS verification
- Hardcoded IP addresses and credentials

## Integration with smart-commit

Use `commit-review` before `smart-commit` for a complete pre-commit pipeline:
```bash
node skills/commit-review/index.js && node skills/smart-commit/index.js --commit
```
