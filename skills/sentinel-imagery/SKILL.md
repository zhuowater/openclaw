---
name: sentinel-imagery
description: Satellite imagery from Sentinel-2. Use for Earth observation, terrain analysis, change detection.
---

# Sentinel-2 Satellite Imagery Scanner

## Purpose
Search Copernicus Data Space for recent Sentinel-2 satellite imagery over specified coordinates. Used for battle damage assessment (BDA) by comparing pre-strike and post-strike imagery.

## Intelligence Value
- **Pre/post strike comparison**: Detect structural damage to facilities
- **Activity monitoring**: Track construction, vehicle movement, facility operations
- **Cloud-free window planning**: Know when clear imagery is available
- **Change detection**: Identify new craters, rubble, burn marks

## Data Source
- **API**: Copernicus Data Space OData catalogue
- **URL**: `https://catalogue.dataspace.copernicus.eu/odata/v1/Products`
- **Auth**: Free search (no key needed). Download requires Copernicus account.
- **Resolution**: Sentinel-2 = 10m/pixel (visible bands)
- **Revisit**: ~5 days per location
- **Browser**: https://browser.dataspace.copernicus.eu/

## Preset Locations
| Name | Coordinates | Description |
|------|-------------|-------------|
| natanz | 51.727, 33.721 | Uranium enrichment facility |
| fordow | 51.567, 34.880 | Underground enrichment facility |
| bushehr | 50.886, 28.831 | Nuclear power plant |
| isfahan | 51.677, 32.652 | Nuclear technology center |
| tehran | 51.42, 35.69 | Capital city |
| bandar_abbas | 56.27, 27.18 | Naval base |
| parchin | 51.77, 35.52 | Military complex |
| arak | 49.28, 34.09 | Heavy water reactor |

## Usage

```bash
# Search latest imagery for Natanz
python3 scripts/sentinel_scan.py --location natanz

# Custom coordinates
python3 scripts/sentinel_scan.py --lat 33.721 --lon 51.727

# Low cloud cover only, JSON output
python3 scripts/sentinel_scan.py --location natanz --max-cloud 20 --json

# Scan all preset locations
python3 scripts/sentinel_scan.py --all-locations

# With cloud cover detail (slower, extra API calls)
python3 scripts/sentinel_scan.py --location natanz --cloud-detail

# List available presets
python3 scripts/sentinel_scan.py --list-locations
```

## Options
| Flag | Description |
|------|-------------|
| `--location NAME` | Preset location name |
| `--lat`, `--lon` | Custom coordinates |
| `--days N` | Days to look back (default: 30) |
| `--max-results N` | Max results (default: 10) |
| `--max-cloud N` | Max cloud cover % |
| `--level L1C/L2A` | Processing level (default: L2A) |
| `--all-locations` | Scan all presets |
| `--cloud-detail` | Fetch per-product cloud cover |
| `--json` | JSON output |

## Output Fields
- `date`: Image capture date
- `name`: Product name (contains satellite, date, tile info)
- `id`: Product UUID (needed for download)
- `size_mb`: Product size
- `online`: Whether product is available for immediate download
- `download_url`: Direct download link (requires auth)
- `browser_url`: View in Copernicus browser
