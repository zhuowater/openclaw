---
name: websdr-monitor
description: Track online shortwave radio receivers (WebSDR/KiwiSDR). Detect outages in conflict zones. Use for radio monitoring, communications intelligence.
---

# WebSDR/KiwiSDR Monitor

Track online shortwave radio receivers worldwide. Detect outages in conflict zones.

## Usage

```bash
python3 scripts/websdr_scan.py --region middle_east
python3 scripts/websdr_scan.py --region iran --json
```

## Regions

middle_east, iran, israel, europe, global

## Intelligence Value

- Receiver goes offline → infrastructure damage or power outage in that area
- Compare online rates before/after strikes
- KiwiSDR receivers are civilian hobbyist equipment — sensitive to local conditions
- HF bands (2-30 MHz) carry military communications
