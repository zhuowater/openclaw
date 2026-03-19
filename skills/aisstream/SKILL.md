---
name: aisstream
description: Real-time vessel tracking via AISStream.io WebSocket API. Use for ship tracking, maritime surveillance, port monitoring.
---

# AISStream Ship Scanner

Real-time vessel tracking via AISStream.io WebSocket API.

## Setup

1. Register at https://aisstream.io (GitHub login)
2. Generate API key at https://aisstream.io/apikeys
3. Set env: `export AISSTREAM_API_KEY="your-key"`
4. Install: `pip install websockets`

## Usage

```bash
# Scan Strait of Hormuz (60 seconds collection)
python3 scripts/ais_scan.py --region hormuz

# Quick 30-second scan
python3 scripts/ais_scan.py --region hormuz --duration 30

# Persian Gulf wide scan
python3 scripts/ais_scan.py --region persian_gulf --duration 90

# JSON output
python3 scripts/ais_scan.py --region hormuz --json

# Custom bounding box
python3 scripts/ais_scan.py --bbox 24.5,54.0,27.5,58.0
```

## Preset Regions

| Region | Description |
|--------|-------------|
| hormuz | Strait of Hormuz |
| persian_gulf | Persian Gulf |
| gulf_of_oman | Gulf of Oman |
| red_sea | Red Sea + Suez |
| bab_el_mandeb | Bab el-Mandeb Strait |

## Output

- Total vessel count (moving vs stopped)
- Ship type breakdown (tankers, cargo, passenger, etc.)
- Flag state / country distribution
- Largest tankers with destination and speed
- Fastest vessels

## Intelligence Use

- **Blockade detection**: Compare tanker counts over time. Sharp drop = blockade effective
- **Rerouting**: Tankers with unusual destinations (avoiding Hormuz → going around Africa)
- **Military presence**: Vessels with no name/unusual behavior
- **Speed anomalies**: Stopped tankers in shipping lane = possible seizure

## Dependencies

- Python 3.8+
- `websockets` package
- AISStream.io API key (free tier available)
