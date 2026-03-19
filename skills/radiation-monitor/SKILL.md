---
name: radiation-monitor
description: OSINT radiation surveillance from public monitoring networks. Use for radiation level tracking, nuclear incident detection.
---

# Radiation Monitor — OSINT Radiation Surveillance

## Purpose
Monitor ambient radiation levels near nuclear facilities. Detect anomalous increases that may indicate nuclear facility damage, radiological releases, or nuclear detonations.

## Intelligence Value
- **Post-strike assessment**: Detect radiation spikes after strikes on nuclear facilities
- **Baseline monitoring**: Establish normal levels for change detection
- **Early warning**: Radiation plume from damaged reactors/enrichment cascades
- **Contamination mapping**: Track fallout patterns

## Radiation Thresholds
| Level | μSv/h | Meaning |
|-------|-------|---------|
| 🟢 Normal | 0.05-0.20 | Natural background radiation |
| 🟡 Slightly elevated | 0.20-0.50 | Marginal, possible natural variation |
| 🟠 Elevated | 0.50-1.0 | Warrants attention |
| 🔴 High | 1.0-10.0 | Significant — possible contamination |
| ☢️ Danger | >10.0 | Dangerous — immediate threat |

## Data Sources
### Primary: Safecast API
- **URL**: `https://api.safecast.org/measurements.json`
- **Auth**: Free, no key needed
- **Coverage**: Strongest in Japan; sparse in Middle East/Iran
- **Data**: CPM (counts per minute) from volunteer Geiger counters
- **Conversion**: CPM → μSv/h using sensor-specific factors

### Fallback: netc.com
- Radiation Network public data
- Global station coverage

### Coverage Note
⚠️ **Iran has very limited Safecast coverage.** Use `--location fukushima` or `--location tokyo` as reference points with good data. For Iran locations, wide search radius (1000km+) may be needed to find any readings at all.

## Preset Locations
| Name | Coordinates | Description |
|------|-------------|-------------|
| natanz | 51.727, 33.721 | Uranium enrichment facility |
| fordow | 51.567, 34.880 | Underground enrichment facility |
| bushehr | 50.886, 28.831 | Nuclear power plant |
| isfahan | 51.677, 32.652 | Nuclear technology center |
| tehran | 51.42, 35.69 | Tehran |
| arak | 49.28, 34.09 | Heavy water reactor |
| tokyo | 139.69, 35.69 | Reference city (good coverage) |
| fukushima | 141.03, 37.42 | Reference (elevated baseline) |

## Usage

```bash
# Check radiation near Natanz
python3 scripts/radiation_scan.py --location natanz

# Reference check with known data
python3 scripts/radiation_scan.py --location fukushima

# Custom coordinates with radius
python3 scripts/radiation_scan.py --lat 33.721 --lon 51.727 --radius 500

# Scan all locations, JSON output
python3 scripts/radiation_scan.py --all-locations --json

# List presets
python3 scripts/radiation_scan.py --list-locations
```

## Options
| Flag | Description |
|------|-------------|
| `--location NAME` | Preset location |
| `--lat`, `--lon` | Custom coordinates |
| `--radius N` | Search radius in km (default: 1000) |
| `--all-locations` | Scan all presets |
| `--json` | JSON output |

## CPM to μSv/h Conversion
Different Geiger-Müller tube types have different sensitivities:
- **LND-7128EC** (pancake): 334 CPM / μSv/h
- **LND-7318U**: 108 CPM / μSv/h
- **Generic default**: 120 CPM / μSv/h
