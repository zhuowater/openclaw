---
name: data-viz
description: Generate SVG charts (bar, horizontal bar, line, pie, sparkline, heatmap, gauge) from data arrays. Use when you need to visualize numbers, trends, comparisons, distributions, time patterns, or health scores without external dependencies. Outputs SVG files or inline SVG strings.
---

# Data Viz

Generate lightweight SVG charts from structured data. No external dependencies.

## Chart Types

| Type | Function | Best For |
|------|----------|----------|
| `bar` | `barChart()` | Comparing categories |
| `hbar` | `horizontalBar()` | Ranked lists, long labels |
| `line` | `lineChart()` | Trends over time (multi-series) |
| `pie` | `pieChart()` | Proportions |
| `spark` | `sparkline()` | Inline mini-trends |
| `heat` | `heatmap()` | 2D patterns (time × category) |
| `gauge` | `gauge()` | Health scores, single metrics |

## Usage

```javascript
const { barChart, lineChart, pieChart, sparkline, heatmap, gauge, horizontalBar } = require('./skills/data-viz');

// Bar chart
barChart({ title: 'Revenue', labels: ['Q1','Q2','Q3'], values: [100,200,150] });

// Horizontal bar (great for ranked data)
horizontalBar({ title: 'Top Tools', labels: ['exec','read','web_search'], values: [45,30,12] });

// Line chart (multi-series)
lineChart({
  title: 'Price Trend',
  labels: ['Mon','Tue','Wed','Thu','Fri'],
  series: [
    { name: 'BTC', values: [60000,62000,58000,65000,63000], color: '#F7931A' },
    { name: 'ETH', values: [3000,3200,2900,3400,3100], color: '#627EEA' }
  ]
});

// Pie chart
pieChart({
  title: 'Share',
  slices: [
    { label: 'Chrome', value: 65, color: '#4285F4' },
    { label: 'Firefox', value: 18 },
    { label: 'Other', value: 17 }
  ]
});

// Sparkline
sparkline({ values: [3,7,2,9,4,6,8,1,5], width: 200, height: 40 });

// Heatmap (rows × cols → 2D data array)
heatmap({
  title: 'Tool Usage by Hour',
  rows: ['Mon','Tue','Wed','Thu','Fri'],
  cols: ['0','4','8','12','16','20'],
  data: [
    [1,0,3,8,5,2],
    [0,0,4,7,6,1],
    [2,1,5,9,4,3],
    [0,0,3,6,8,2],
    [1,0,2,5,3,1]
  ],
  colorLow: '#ebedf0',
  colorHigh: '#216e39'
});

// Gauge (health score / single metric)
gauge({
  title: 'System Health',
  value: 78,
  min: 0,
  max: 100,
  suffix: '%',
  label: 'Overall Score',
  thresholds: [
    { limit: 0.33, color: '#E74C3C' },  // red zone
    { limit: 0.66, color: '#F39C12' },  // yellow zone
    { limit: 1.0,  color: '#2ECC71' }   // green zone
  ]
});
```

## CLI

```bash
# Bar chart
echo '{"labels":["Q1","Q2"],"values":[100,200]}' | node skills/data-viz/index.js bar

# Heatmap
echo '{"rows":["A","B"],"cols":["1","2","3"],"data":[[1,5,3],[4,2,6]]}' | \
  node skills/data-viz/index.js heat --title "Pattern" -o /tmp/heat.svg

# Gauge
echo '{"value":85,"max":100,"label":"Health"}' | node skills/data-viz/index.js gauge

# Horizontal bar
echo '{"labels":["exec","read","write"],"values":[45,30,12]}' | node skills/data-viz/index.js hbar

# Save to file
echo '...' | node skills/data-viz/index.js bar -o /tmp/chart.svg
```
