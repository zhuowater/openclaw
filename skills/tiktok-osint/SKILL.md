---
name: tiktok-osint
description: TikTok OSINT scanner via TikAPI.io REST API. Use for social media intelligence, hashtag search, video discovery.
---

# TikTok OSINT Scanner

Search TikTok for videos by hashtag via TikAPI.io REST API.

## Setup

API key stored in env `TIKAPI_KEY` (default hardcoded).
No proxy needed — TikAPI.io is accessible directly.

## Usage

```bash
# Search specific hashtag
python3 scripts/tiktok_scan.py -k "iranwar" --limit 10

# Scan all Iran-related hashtags
python3 scripts/tiktok_scan.py --iran

# JSON output
python3 scripts/tiktok_scan.py -k "tehran" --json --limit 15
```

## Iran Preset Hashtags

`iranwar`, `iran`, `tehran`, `irgc`, `hormuz`, `khamenei`

## Output

- Hashtag stats (total views, total videos)
- Per-video: description, author, views, likes, comments, shares
- Direct URL to each video
- Region/location tag when available
- Sorted by views (most viral first)

## Intelligence Use

- **Ground truth**: Local videos from strike zones, protests, military movements
- **Sentiment**: Comments + shares reveal local mood
- **Timing**: TikTok videos precede news by hours
- **Verification**: Cross-reference with FIRMS fire data + ADS-B flights
- **Viral tracking**: High view count = narrative shaping

## API Limits

TikAPI.io paid plan. No proxy needed.
