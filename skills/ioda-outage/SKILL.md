---
name: ioda-outage
description: Detect internet outages by country using IODA (Georgia Tech) + RIPE RIS BGP data. Use for outage detection, connectivity monitoring.
---

# IODA Internet Outage Scanner

Detect internet outages by country using IODA (Georgia Tech) + RIPE RIS BGP data.

## Setup

No API keys needed. All endpoints are free and public.

## Usage

```bash
# Full Iran scan (IODA signals + BGP routing for key ASNs)
python3 scripts/ioda_scan.py --iran

# Any country by code
python3 scripts/ioda_scan.py -c IR --hours 24

# JSON output
python3 scripts/ioda_scan.py --iran --json

# Presets: iran, russia, ukraine, china, syria, iraq, israel, lebanon, yemen, myanmar
python3 scripts/ioda_scan.py -c ukraine
```

## Data Sources

| Source | What it measures | Update frequency |
|--------|-----------------|------------------|
| Google Transparency (gtr) | Web search traffic volume | 30 min |
| BGP (bgp) | Route announcements/withdrawals | 5 min |
| Active Probing (ping-slash24) | Reachable /24 networks | 10 min |
| MERIT Darknet (merit-nt) | Unsolicited traffic | 30 min |

## Intelligence Patterns

- **Traffic drop + BGP stable** = Government shutdown (NIC-level block)
- **Traffic drop + BGP withdrawals** = Physical infrastructure destroyed
- **Traffic drop + Ping stable** = International gateway cut, internal network alive
- **Traffic drop + Ping drop** = Widespread infrastructure damage

## Iran Key ASNs

- AS12880: DCI (backbone)
- AS58224: TIC (international gateway)
- AS44244: Irancell (mobile)
- AS197207: MCI (mobile)
