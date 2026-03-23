---
name: page-diff
description: Monitor specific web pages for content changes. Track CVE pages, release notes, API docs, pricing pages, changelogs — any URL where you want to know when content changes. Use when asked to "watch this page", "monitor URL for changes", "track page updates", "did this page change", "page diff", "网页监控", "页面变化".
---

# Page Diff

Monitor web pages for content changes. Stores text snapshots and reports diffs.

**Different from topic-monitor** (keyword-based search) and **uptime-monitor** (health/latency). This tracks actual *content changes* on specific URLs.

## Usage

```bash
SKILL=/root/openclaw/skills/page-diff/index.js

# Add a page to monitor
node $SKILL add https://nvd.nist.gov/vuln/detail/CVE-2024-3094 --name xz-cve

# Check all pages for changes
node $SKILL check

# Check one specific page
node $SKILL check xz-cve

# Quiet mode (JSON output, only reports changes)
node $SKILL check --quiet

# Show diff of most recent change
node $SKILL diff xz-cve

# List all monitored pages
node $SKILL list

# Show snapshot history
node $SKILL history xz-cve --limit 5

# Remove a page
node $SKILL remove xz-cve
```

## Use Cases

- **CVE tracking**: Monitor NVD/MITRE pages for score or description updates
- **Release monitoring**: Watch GitHub release pages, changelogs
- **API docs**: Detect documentation changes in APIs you depend on
- **Competitor watch**: Track pricing or feature pages
- **Regulatory**: Monitor policy/compliance pages for updates

## Automation

Combine with cron for periodic checks:
```
Schedule: every 6 hours
Command: node $SKILL check --quiet
→ Report changes via message if any detected
```

## Data Storage

- Targets: `skills/page-diff/data/targets.json`
- Snapshots: `skills/page-diff/data/snapshots/<name>/`
- Each snapshot: timestamped text file with content hash
