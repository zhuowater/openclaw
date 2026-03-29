---
name: intel-map
description: Generate interactive intelligence maps (HTML/Leaflet.js) from structured data. Plots FIRMS fire hotspots, conflict zones, infrastructure points, and custom markers on a self-contained map. Use when asked to "create a map", "plot on map", "visualize locations", "threat map", "情报地图", "态势图", "标注地图", or when intelligence data has geographic coordinates.
---

# intel-map

Generate self-contained HTML maps with Leaflet.js for intelligence visualization.

## Why

The agent collects geo-located intelligence (FIRMS satellite fires, conflict events, infrastructure locations) but has no way to visualize them spatially. This skill produces a single HTML file with an interactive map — no server needed, viewable in any browser.

## Usage

```bash
SKILL=/root/openclaw/skills/intel-map/index.js

# Generate map from JSON data
node $SKILL generate --data markers.json --output threat-map.html

# Generate from FIRMS data (auto-fetches recent fires for a region)
node $SKILL firms --region "iran" --hours 24 --output iran-fires.html

# Quick plot: pass markers directly via CLI
node $SKILL plot --markers '[{"lat":35.6,"lng":51.4,"label":"Tehran","type":"city"}]' --output quick.html

# Pipe JSON in
cat intelligence.json | node $SKILL generate --output intel-map.html
```

## Marker Format

```json
{
  "lat": 35.6892,
  "lng": 51.3890,
  "label": "Tehran",
  "type": "fire|conflict|infrastructure|city|custom",
  "severity": "low|medium|high|critical",
  "details": "Optional description",
  "timestamp": "2026-03-29T08:00:00Z"
}
```

## Map Types

| Type | Color | Icon |
|------|-------|------|
| fire | red | 🔥 |
| conflict | orange | ⚔️ |
| infrastructure | blue | 🏭 |
| city | gray | 🏙️ |
| custom | green | 📍 |

## Programmatic API

```javascript
const { generateMap, firmsToMarkers, plotMarkers } = require('./skills/intel-map');

// Generate map HTML string
const html = generateMap({
  title: 'Iran Conflict Map',
  markers: [...],
  center: [32.0, 53.0],  // optional, auto-calculated if omitted
  zoom: 6                 // optional
});

// Convert FIRMS CSV data to markers
const markers = firmsToMarkers(firmsData, { minConfidence: 80 });

// Write map file
plotMarkers(markers, { output: '/tmp/map.html', title: 'Intel Map' });
```

## Integration with Other Skills

- **FIRMS satellite**: Pipe fire data directly → `firmsToMarkers()`
- **GDELT events**: Convert event records to markers
- **intelligence suite**: Aggregate all geo-intelligence onto one map
- **Canvas**: Present map via `canvas present` for interactive viewing
