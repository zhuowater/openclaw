---
name: commodity-prices
description: Monitor commodity prices (oil, gold, etc.). Use for commodity tracking, price alerts, market analysis.
---

# Commodity Price Monitor

## Purpose
Track war-sensitive commodity prices and financial indicators. Oil spikes indicate supply disruption/sanctions, VIX spikes indicate market panic, and gold surges indicate safe-haven flight.

## Usage
```bash
# All commodities
python3 scripts/commodity_scan.py

# JSON output
python3 scripts/commodity_scan.py --json

# Specific symbols
python3 scripts/commodity_scan.py --symbols CL=F ^VIX
```

## Options
| Flag | Default | Description |
|------|---------|-------------|
| `--json`, `-j` | off | JSON output |
| `--symbols`, `-s` | all | Specific symbols to fetch |

## Tracked Commodities
| Symbol | Name | War Signal |
|--------|------|------------|
| CL=F | WTI Crude Oil | Spike = blockade/sanctions effective |
| BZ=F | Brent Crude Oil | Spike = global supply disruption |
| GC=F | Gold | Rise = safe-haven demand |
| SI=F | Silver | Rise = industrial + safe-haven |
| ^VIX | Fear Index | >30 = extreme market panic |

## Data Source
- **Primary**: Yahoo Finance v8 chart API (direct, then via SOCKS5 proxy)
- **Fallback**: Yahoo Finance page scrape via proxy
- **Proxy**: `socks5h://127.0.0.1:7880` (used as fallback)
- **Cost**: Free, no API key needed
- **Note**: Yahoo may rate-limit or block; proxy fallback handles this
