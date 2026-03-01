---
name: changelog-gen
description: Generate structured changelogs from git history. Use when asked to create a changelog, release notes, summarize recent changes, or prepare a version release summary. Supports date ranges, tag-to-tag diffs, and multiple output formats.
---

# Changelog Generator

Generates human-readable changelogs from git commit history.

## Usage

```bash
# Generate changelog for last 7 days
node /root/openclaw/skills/changelog-gen/index.js --days 7

# Generate changelog between two dates
node /root/openclaw/skills/changelog-gen/index.js --since 2026-02-25 --until 2026-03-01

# Generate changelog between two tags/commits
node /root/openclaw/skills/changelog-gen/index.js --from v1.0 --to v2.0

# Generate changelog for last N commits
node /root/openclaw/skills/changelog-gen/index.js --commits 20

# Output as markdown file
node /root/openclaw/skills/changelog-gen/index.js --days 7 --output CHANGELOG.md

# JSON output for programmatic use
node /root/openclaw/skills/changelog-gen/index.js --days 7 --format json
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--days N` | Last N days | 7 |
| `--since DATE` | Start date (ISO) | - |
| `--until DATE` | End date (ISO) | now |
| `--from REF` | Start git ref | - |
| `--to REF` | End git ref | HEAD |
| `--commits N` | Last N commits | - |
| `--output FILE` | Write to file | stdout |
| `--format md\|json` | Output format | md |
| `--repo PATH` | Git repo path | cwd |
| `--group` | Group by category | true |

## Categories

Commits are auto-classified by conventional commit prefixes:
- **feat/feature** → ✨ Features
- **fix/bugfix** → 🐛 Bug Fixes
- **perf/optimize** → ⚡ Performance
- **docs/doc** → 📝 Documentation
- **refactor** → ♻️ Refactoring
- **security/sec** → 🔒 Security
- **evolution/evo** → 🧬 Evolution
- **intel** → 🕵️ Intelligence
- **trading** → 📊 Trading
- Other → 🔧 Other Changes

## Integration with Evolver

After evolution cycles, generate a changelog:
```bash
node /root/openclaw/skills/changelog-gen/index.js --days 1 --output /tmp/today-changes.md
```
