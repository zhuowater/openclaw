---
name: gdelt-events
description: Monitor global events via GDELT database. Use for geopolitical event tracking, conflict monitoring, news analysis.
---

# GDELT Event Monitor

## Purpose
Download and filter the latest 15-minute GDELT v2 event data to track geopolitical events by country. Useful for detecting military actions, protests, and diplomatic changes in near-real-time.

## Usage
```bash
# Iran events (default)
python3 scripts/gdelt_scan.py

# Israel, conflict events only, JSON output
python3 scripts/gdelt_scan.py --country israel --conflict-only --json

# Russia — all events
python3 scripts/gdelt_scan.py --country russia

# Using 3-letter codes directly
python3 scripts/gdelt_scan.py --country IRN --json
```

## Options
| Flag | Default | Description |
|------|---------|-------------|
| `--country`, `-c` | iran | Country name or 3-letter code |
| `--conflict-only`, `-f` | off | Only codes 14-20 (protest/assault/fight/violence) |
| `--json`, `-j` | off | JSON output |

## CAMEO Event Codes (key ones)
| Root Code | Category |
|-----------|----------|
| 14 | Protest |
| 15 | Military posture |
| 17 | Coerce |
| 18 | Assault / Use force |
| 19 | Fight / Military engagement |
| 20 | Unconventional mass violence |

## Goldstein Scale
- **-10** = Extreme conflict (military attack)
- **0** = Neutral
- **+10** = Extreme cooperation

## Data Source
- **URL**: http://data.gdeltproject.org/gdeltv2/lastupdate.txt
- **Format**: Tab-separated CSV (gzipped)
- **Update frequency**: Every 15 minutes
- **Cost**: Free, no API key, no proxy needed
- **Reference**: http://data.gdeltproject.org/documentation/GDELT-Event_Codebook-V2.0.pdf
