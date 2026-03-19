---
name: submarine-cables
description: Monitor undersea cable status and outages. Use for infrastructure monitoring, connectivity analysis.
---

# Submarine Cable Monitor

## Purpose
Track undersea fiber optic cables in conflict regions. Intelligence value: cable cuts cause persistent internet blackouts distinct from government-ordered shutdowns. Helps distinguish physical infrastructure damage from policy-based internet censorship.

## Usage
```bash
# Iran cables (default)
python3 scripts/cable_scan.py

# Persian Gulf region, JSON output
python3 scripts/cable_scan.py --region persian_gulf --json

# Red Sea corridor
python3 scripts/cable_scan.py --region red_sea

# Middle East (broad)
python3 scripts/cable_scan.py --region middle_east

# List all cables worldwide
python3 scripts/cable_scan.py --list-all
```

## Options
| Flag | Default | Description |
|------|---------|-------------|
| `--region`, `-r` | iran | Region filter |
| `--json`, `-j` | off | JSON output |
| `--list-all`, `-l` | off | List all cables (no filter) |

## Available Regions
| Region | Description |
|--------|-------------|
| iran | Cables landing in Iran |
| persian_gulf | Iran, Iraq, Kuwait, Bahrain, Qatar, UAE, Saudi Arabia, Oman |
| red_sea | Egypt, Saudi Arabia, Yemen, Djibouti, Eritrea, Sudan, Jordan, Israel |
| middle_east | All Middle East countries |
| east_asia | China, Taiwan, Japan, South Korea |

## Key Iran Cables
- **FALCON** — Major Gulf cable, lands at Bandar Abbas & Chabahar
- **FOG/FIG** — Fiber Optic Gulf / Fibre in Gulf
- **Kuwait-Iran** — Direct bilateral link
- **UAE-Iran** — Direct bilateral link
- **POI Network** — Pishgaman Oman-Iran
- **IMEWE** — India-Middle East-Western Europe backbone

## Data Source
- **API**: https://www.submarinecablemap.com/api/v3/
- **Provider**: TeleGeography
- **Format**: JSON (cable list + per-cable details)
- **Cost**: Free, no API key needed
- **Note**: Static data — does not show real-time cable status/outages. Cross-reference with internet monitoring (IODA, OONI) for outage detection.
