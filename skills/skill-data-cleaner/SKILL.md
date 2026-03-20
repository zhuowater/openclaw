---
name: skill-data-cleaner
description: Scan and clean stale data files accumulated within skills directories. Unlike disk-janitor (temp/cache) or memory-janitor (memory files), this focuses on generated data files inside skills/ (JSON reports, CSV exports, log files). Use when asked to "clean skill data", "stale files in skills", "skill disk usage", or during periodic maintenance.
---

# skill-data-cleaner

Finds and cleans stale data files that accumulate inside `skills/` directories over time (e.g., old JSON reports, CSV exports, log files from monitoring scripts).

## Why

Skills like `intelligence` generate periodic JSON reports (FIFA odds, Trump term monitoring) that accumulate and never get cleaned. This skill identifies them and offers safe cleanup.

## CLI Usage

```bash
# Scan and report (no deletions)
node skills/skill-data-cleaner/index.js

# Scan with custom age threshold (default: 14 days)
node skills/skill-data-cleaner/index.js --max-age 7

# Actually clean stale files
node skills/skill-data-cleaner/index.js --clean

# JSON output
node skills/skill-data-cleaner/index.js --json

# Scan specific skill
node skills/skill-data-cleaner/index.js --skill intelligence
```

## Programmatic Usage

```javascript
const { scan, clean, report } = require('./skills/skill-data-cleaner');

// Scan all skills for stale data
const results = await scan({ maxAgeDays: 14 });
// { skills: [{ name, staleFiles, totalSizeKB, oldestFile }], totalStale, totalSizeKB }

// Clean with confirmation
const cleaned = await clean({ maxAgeDays: 14, dryRun: false });
// { removed: 42, freedKB: 850, details: [...] }
```

## Safety

- Never touches: `index.js`, `SKILL.md`, `package.json`, `package-lock.json`, `node_modules/`, `.env`
- Never touches files in the evolver's `assets/` directory
- Only targets data file extensions: `.json`, `.csv`, `.log`, `.txt` (configurable)
- Skips files less than `maxAgeDays` old (default: 14)
- `--clean` flag required for actual deletion; default is dry-run report
- Protected skills: `evolver`, `feishu-evolver-wrapper`, `feishu-common` (never cleaned)
