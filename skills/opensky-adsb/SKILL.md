---
name: opensky-adsb
description: Real-time aircraft tracking via OpenSky Network REST API. Use for flight tracking, airspace monitoring, military aviation detection.
---

# OpenSky ADS-B Aircraft Scanner

Real-time aircraft tracking via OpenSky Network REST API.

## Usage

```bash
# Scan Iran airspace
python3 scripts/adsb_scan.py --region iran

# Scan Strait of Hormuz
python3 scripts/adsb_scan.py --region hormuz

# Multi-region scan (iran + hormuz + persian_gulf)
python3 scripts/adsb_scan.py --multi

# JSON output for programmatic use
python3 scripts/adsb_scan.py --region iran --json

# Custom bounding box: lamin,lomin,lamax,lomax
python3 scripts/adsb_scan.py --bbox 25,44,40,63.5
```

## Preset Regions

| Region | Description |
|--------|-------------|
| iran | Iran full territory |
| hormuz | Strait of Hormuz |
| persian_gulf | Persian Gulf |
| iraq_syria | Iraq + Syria corridor |
| israel | Israel airspace |
| gulf_of_oman | Gulf of Oman |
| middle_east | Full Middle East |

## Output

- Total aircraft count (airborne vs ground)
- Military aircraft identification (US, UK, Israel, Iran by ICAO24 prefix)
- Country breakdown
- High altitude (>10km) and low altitude (<500m) aircraft
- Emergency squawk codes (7500 hijack, 7600 radio, 7700 emergency)

## Intelligence Use

- Compare aircraft counts between scans to detect activity spikes
- Monitor military aircraft density near conflict zones
- Track high-altitude patterns (bombers, tankers, surveillance)
- Detect low-altitude patterns (helicopters, drones, close air support)

## Rate Limits

- Anonymous: 10 req/min, limited to 5s resolution
- Registered: higher limits (free registration at opensky-network.org)
- No API key needed for basic queries

## Proxy

All requests go through `socks5h://127.0.0.1:7880` by default.
Override with `SOCKS_PROXY` env var.
