---
name: report-builder
description: Build structured reports from templates with multiple data sections. Use when asked to "create a report", "build a briefing", "generate a report", "weekly report", "compile findings", "report template", "生成报告", "编写报告", "周报", "汇报". Combines data from multiple sources into formatted markdown reports with table of contents, sections, tables, and metadata.
---

# report-builder

Build professional structured reports from templates and data sources.

## Why

The agent generates intelligence, analysis, and data across many skills (threat-intel, activity-digest, news-summary, etc.) but lacks a unified way to assemble polished, structured reports. This skill provides templating, section assembly, and formatting.

## CLI Usage

```bash
SKILL=/root/openclaw/skills/report-builder/index.js

# Create a new report from template
node $SKILL create --template daily-intel --title "Daily Intelligence Brief"

# Create a custom report with sections
node $SKILL create --title "Weekly Review" --sections "summary,security,geopolitics,market,action-items"

# List available templates
node $SKILL templates

# Add a section to an existing report
node $SKILL add-section --report /path/to/report.md --name "New Findings" --content "text here"

# Generate table of contents for a report
node $SKILL toc --report /path/to/report.md

# Export report with metadata header
node $SKILL export --report /path/to/report.md --format markdown --output /tmp/final.md
```

## Programmatic Usage

```javascript
const { createReport, addSection, generateTOC, exportReport, listTemplates } = require('./skills/report-builder');

// Create from template
const report = createReport({
  template: 'daily-intel',
  title: 'Daily Intelligence Brief - 2026-03-29',
  author: '奇安信机器人',
  sections: { summary: '...', security: '...', geopolitics: '...' }
});

// Build custom report
const custom = createReport({
  title: 'Custom Report',
  sections: ['intro', 'findings', 'recommendations'],
  metadata: { classification: 'INTERNAL', date: '2026-03-29' }
});

// Add section
addSection(report, { name: 'Appendix', content: '...', level: 2 });

// Generate TOC
const toc = generateTOC(report);

// Export
const output = exportReport(report, { format: 'markdown', includeTOC: true });
```

## Built-in Templates

| Template | Sections | Use Case |
|----------|----------|----------|
| `daily-intel` | Summary, Security, Geopolitics, Tech, Markets, Action Items | Daily intelligence briefing |
| `weekly-review` | Executive Summary, Achievements, Issues, Metrics, Next Week | Weekly progress report |
| `incident` | Timeline, Impact, Root Cause, Remediation, Lessons Learned | Incident response report |
| `research` | Abstract, Background, Methodology, Findings, Conclusion | Research findings |
| `blank` | (none — custom sections) | Custom reports |

## Section Formatting

Each section supports:
- **Markdown content** (headers, lists, tables, code blocks)
- **Priority tags**: `[HIGH]`, `[MEDIUM]`, `[LOW]`
- **Status indicators**: `✅`, `⚠️`, `🔴`, `🟢`, `🟡`
- **Timestamps** auto-formatted from ISO strings
- **Tables** with alignment support
