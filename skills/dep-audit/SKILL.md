---
name: dep-audit
description: Audit Node.js project dependencies for outdated packages, known vulnerabilities, and license issues. Use when asked to "check dependencies", "audit packages", "outdated deps", "dependency health", "license check", "npm audit", or "依赖检查".
---

# dep-audit

Lightweight dependency auditor for Node.js projects. Runs `npm audit`, `npm outdated`, and license scanning in one pass.

## Usage

```bash
# Full audit of a project directory
node /root/openclaw/skills/dep-audit/index.js /path/to/project

# Audit current workspace (default: /root/openclaw)
node /root/openclaw/skills/dep-audit/index.js

# JSON output for programmatic use
node /root/openclaw/skills/dep-audit/index.js --json /path/to/project
```

## Output

Returns a structured report with:

- **Vulnerabilities**: Critical/High/Moderate/Low counts from `npm audit`
- **Outdated**: Packages with available updates (current vs latest)
- **Licenses**: Flags packages with non-standard or restrictive licenses
- **Summary**: Overall health score (0-100) and recommended actions

## Programmatic API

```javascript
const { audit } = require('./skills/dep-audit');
const report = await audit('/path/to/project');
// report.score, report.vulnerabilities, report.outdated, report.licenses
```
