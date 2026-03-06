---
name: smart-commit
description: Generate intelligent git commit messages from staged changes. Analyzes diffs to produce conventional-commit-format messages with scope detection, breaking change awareness, and bilingual support (EN/ZH). Use when asked to "commit", "smart commit", "auto commit", "generate commit message", "智能提交", or during evolution cycles that need git commits.
---

# smart-commit

Analyzes `git diff --staged` and generates a meaningful commit message following [Conventional Commits](https://www.conventionalcommits.org/).

## Usage

```bash
# Generate commit message (dry-run, prints to stdout)
node /root/openclaw/skills/smart-commit/index.js

# Generate and commit immediately
node /root/openclaw/skills/smart-commit/index.js --commit

# Force a specific type (feat/fix/chore/refactor/docs/style/test/perf/ci)
node /root/openclaw/skills/smart-commit/index.js --type feat

# Chinese commit message
node /root/openclaw/skills/smart-commit/index.js --lang zh

# Include body with bullet points of changes
node /root/openclaw/skills/smart-commit/index.js --body

# JSON output
node /root/openclaw/skills/smart-commit/index.js --json
```

## How It Works

1. Reads `git diff --staged` (or `--cached`)
2. Analyzes file paths to detect scope (e.g., `skills/foo` → scope `foo`)
3. Categorizes change type from diff content (new files → `feat`, deletions → `refactor`, fixes → `fix`)
4. Generates a concise subject line (≤72 chars)
5. Optionally adds a body with change details

## Commit Types

| Type | When |
|------|------|
| `feat` | New files, new functionality |
| `fix` | Bug fixes, error corrections |
| `refactor` | Code restructuring without behavior change |
| `chore` | Maintenance, config, dependencies |
| `docs` | Documentation only |
| `style` | Formatting, whitespace |
| `perf` | Performance improvements |
| `test` | Adding/modifying tests |
| `ci` | CI/CD changes |

## Integration

Works standalone or called from other skills/scripts:
```js
const { generateCommitMessage } = require('./skills/smart-commit');
const msg = await generateCommitMessage({ lang: 'en', includeBody: true });
```
