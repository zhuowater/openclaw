---
name: usgs-earthquake
description: Monitor earthquakes via USGS API. Use for seismic activity tracking, earthquake alerts, geological monitoring.
---

# USGS Earthquake Monitor

## Purpose
Monitor seismic events (earthquakes, explosions, quarry blasts) in predefined regions using the USGS Earthquake API. Intelligence value: explosion-type events or anomalously shallow quakes may indicate military strikes.

## Usage
```bash
# Iran region, last 48 hours (default)
python3 scripts/usgs_scan.py

# Israel, last 24 hours, M>=3.0
python3 scripts/usgs_scan.py --region israel --hours 24 --min-mag 3.0

# Middle East, JSON output
python3 scripts/usgs_scan.py --region middle_east --json

# Available regions: iran, israel, middle_east, ukraine, taiwan
```

## Options
| Flag | Default | Description |
|------|---------|-------------|
| `--region`, `-r` | iran | Preset region |
| `--hours`, `-t` | 48 | Look-back window |
| `--min-mag`, `-m` | 2.0 | Minimum magnitude |
| `--json`, `-j` | off | JSON output |

## Intelligence Flags
- ⚠️ **EXPLOSION** — `type=explosion`, possible military strike
- ⚠️ **SHALLOW(<5km)** — Depth < 5km, unusual for natural quakes
- 🔴 **MAJOR** — M >= 5.0
- 🏗️ **QUARRY** — Known quarry blast (usually benign)

## Data Source
- **API**: https://earthquake.usgs.gov/fdsnws/event/1/query
- **Format**: GeoJSON
- **Cost**: Free, no API key required, no proxy needed
- **Rate Limit**: Reasonable use; no hard limit documented
- **Latency**: Events appear within minutes of detection
