---
name: data-viz
description: Generate SVG charts (bar, line, pie, sparkline) from data arrays. Use when you need to visualize numbers, trends, comparisons, or distributions without external dependencies. Outputs SVG files or inline SVG strings.
---

# Data Viz

Generate lightweight SVG charts from structured data. No external dependencies.

## Usage

```javascript
const { barChart, lineChart, pieChart, sparkline } = require('./skills/data-viz');

// Bar chart
const svg = barChart({
  title: 'Monthly Revenue',
  labels: ['Jan', 'Feb', 'Mar', 'Apr'],
  values: [120, 340, 250, 410],
  width: 600,
  height: 400,
  color: '#4A90D9'
});

// Line chart (supports multiple series)
const svg = lineChart({
  title: 'Price Trend',
  labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  series: [
    { name: 'BTC', values: [60000, 62000, 58000, 65000, 63000], color: '#F7931A' },
    { name: 'ETH', values: [3000, 3200, 2900, 3400, 3100], color: '#627EEA' }
  ],
  width: 600,
  height: 400
});

// Pie chart
const svg = pieChart({
  title: 'Market Share',
  slices: [
    { label: 'Chrome', value: 65, color: '#4285F4' },
    { label: 'Firefox', value: 18, color: '#FF7139' },
    { label: 'Safari', value: 12, color: '#006CFF' },
    { label: 'Other', value: 5, color: '#999' }
  ],
  width: 400,
  height: 400
});

// Sparkline (inline mini chart)
const svg = sparkline({
  values: [3, 7, 2, 9, 4, 6, 8, 1, 5],
  width: 200,
  height: 40,
  color: '#E74C3C'
});
```

## Saving to File

```javascript
const fs = require('fs');
const { barChart } = require('./skills/data-viz');
const svg = barChart({ labels: ['A','B','C'], values: [10,20,15] });
fs.writeFileSync('/tmp/chart.svg', svg);
// Convert to PNG if needed: exec `convert /tmp/chart.svg /tmp/chart.png`
```

## CLI

```bash
# Quick bar chart from JSON
echo '{"labels":["Q1","Q2","Q3","Q4"],"values":[100,200,150,300]}' | \
  node /root/openclaw/skills/data-viz/index.js bar --title "Quarterly"

# Line chart from JSON
echo '{"labels":["1","2","3"],"series":[{"name":"A","values":[10,20,15]}]}' | \
  node /root/openclaw/skills/data-viz/index.js line

# Save to file
node /root/openclaw/skills/data-viz/index.js bar --title "Test" -o /tmp/chart.svg < data.json
```
