---
name: data-convert
description: Convert data between CSV, JSON, TSV, and Markdown table formats. Use when asked to convert data formats, parse CSV files, generate markdown tables from data, export JSON to CSV, or wrangle tabular data. Triggers on "convert csv", "json to table", "csv to json", "markdown table", "format data", "数据转换", "表格转换".
---

# data-convert

Lightweight data format converter for tabular data. No external dependencies.

## Supported Formats

| From / To | CSV | JSON | TSV | Markdown |
|-----------|-----|------|-----|----------|
| CSV       | —   | ✅   | ✅  | ✅       |
| JSON      | ✅  | —    | ✅  | ✅       |
| TSV       | ✅  | ✅   | —   | ✅       |
| Markdown  | ✅  | ✅   | ✅  | —        |

## CLI Usage

```bash
SKILL=/root/openclaw/skills/data-convert/index.js

# CSV → JSON
node $SKILL --from csv --to json < data.csv

# JSON → Markdown table
node $SKILL --from json --to markdown < data.json

# File input/output
node $SKILL --from csv --to json --input data.csv --output data.json

# Pipe from stdin
echo "name,age\nAlice,30\nBob,25" | node $SKILL --from csv --to markdown

# Auto-detect input format
node $SKILL --to json --input data.csv
```

## Programmatic Usage

```javascript
const { convert, parseCSV, toMarkdown, toJSON, toCSV, toTSV } = require('./skills/data-convert');

// High-level convert
const result = convert(inputString, { from: 'csv', to: 'markdown' });

// Individual parsers
const rows = parseCSV('name,age\nAlice,30');
// → [{ name: 'Alice', age: '30' }]

const md = toMarkdown(rows);
// → | name | age |\n|------|-----|\n| Alice | 30 |
```

## Features

- Auto-detect input format (CSV vs TSV vs JSON)
- Handles quoted fields with commas and newlines
- Preserves column order from source
- Streams large files line-by-line (--stream flag)
- Zero dependencies — pure Node.js
