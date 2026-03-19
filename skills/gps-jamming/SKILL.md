---
name: gps-jamming
description: Detect GPS jamming/interference using ADS-B aircraft navigation anomalies. Use for GPS interference detection, navigation security.
---

# GPS Jamming Detection

Indirect GPS interference detection using ADS-B aircraft navigation anomalies.

## How It Works

Uses existing OpenSky ADS-B data to detect GPS jamming indicators:
- Aircraft transmitting without position data (GPS denied)
- Emergency squawk codes (7500=hijack, 7600=radio failure, 7700=emergency)
- Percentage of aircraft with no GPS fix

## Usage

```bash
python3 scripts/gpsjam_scan.py --region iran
python3 scripts/gpsjam_scan.py --region middle_east --json
```

## Regions

iran, israel, hormuz, middle_east

## Intelligence Patterns

- No GPS position >20% = possible GPS interference
- Emergency squawks + no position >30% = active jamming likely
- 0 aircraft = airspace closed (not jamming)
- Normal: <5% aircraft without position
