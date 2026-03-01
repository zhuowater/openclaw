#!/usr/bin/env python3
"""USGS Earthquake/Explosion Monitor — scan seismic events by region.

Intelligence value:
  - type=explosion may indicate military strikes
  - depth < 5km anomalies may indicate non-natural events
  - Rapid magnitude clusters suggest ongoing operations
"""

import argparse
import json
import sys
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

REGIONS = {
    "iran":        {"minlatitude": 25, "maxlatitude": 40, "minlongitude": 44, "maxlongitude": 63},
    "israel":      {"minlatitude": 29, "maxlatitude": 34, "minlongitude": 34, "maxlongitude": 36},
    "middle_east": {"minlatitude": 20, "maxlatitude": 42, "minlongitude": 30, "maxlongitude": 65},
    "ukraine":     {"minlatitude": 44, "maxlatitude": 53, "minlongitude": 22, "maxlongitude": 40},
    "taiwan":      {"minlatitude": 21, "maxlatitude": 26, "minlongitude": 119, "maxlongitude": 123},
}

API_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"


def fetch_events(region: str, hours: int = 48, min_mag: float = 2.0) -> dict:
    bounds = REGIONS.get(region)
    if not bounds:
        raise ValueError(f"Unknown region: {region}. Available: {', '.join(REGIONS)}")

    now = datetime.now(timezone.utc)
    start = now - timedelta(hours=hours)

    params = {
        "format": "geojson",
        "starttime": start.strftime("%Y-%m-%dT%H:%M:%S"),
        "endtime": now.strftime("%Y-%m-%dT%H:%M:%S"),
        "minmagnitude": str(min_mag),
        **{k: str(v) for k, v in bounds.items()},
    }

    url = API_URL + "?" + "&".join(f"{k}={v}" for k, v in params.items())
    req = urllib.request.Request(url, headers={"User-Agent": "OpenClaw-USGS-Monitor/1.0"})

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: {e.read().decode()[:200]}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Connection error: {e.reason}", file=sys.stderr)
        sys.exit(1)


def parse_events(data: dict) -> list[dict]:
    events = []
    for f in data.get("features", []):
        props = f.get("properties", {})
        coords = f.get("geometry", {}).get("coordinates", [None, None, None])
        time_ms = props.get("time")
        time_str = datetime.fromtimestamp(time_ms / 1000, tz=timezone.utc).strftime(
            "%Y-%m-%d %H:%M:%S UTC"
        ) if time_ms else "unknown"

        depth = coords[2] if len(coords) > 2 else None
        etype = props.get("type", "unknown")
        mag = props.get("mag")

        # Flag suspicious events
        flags = []
        if etype and "explosion" in etype.lower():
            flags.append("⚠️ EXPLOSION")
        if etype and "quarry" in etype.lower():
            flags.append("🏗️ QUARRY")
        if depth is not None and depth < 5:
            flags.append("⚠️ SHALLOW(<5km)")
        if mag is not None and mag >= 5.0:
            flags.append("🔴 MAJOR")

        events.append({
            "magnitude": mag,
            "place": props.get("place", "unknown"),
            "depth_km": depth,
            "time": time_str,
            "time_epoch_ms": time_ms,
            "type": etype,
            "flags": flags,
            "latitude": coords[1] if len(coords) > 1 else None,
            "longitude": coords[0] if len(coords) > 0 else None,
            "url": props.get("url"),
        })

    # Sort by time descending
    events.sort(key=lambda e: e.get("time_epoch_ms") or 0, reverse=True)
    return events


def print_human(events: list[dict], region: str, hours: int):
    print(f"\n🌍 USGS Seismic Events — {region.upper()} (last {hours}h)")
    print(f"   Total events: {len(events)}")
    print("=" * 72)

    if not events:
        print("   No events found.")
        return

    for e in events:
        flag_str = " ".join(e["flags"]) if e["flags"] else ""
        mag_str = f"M{e['magnitude']:.1f}" if e["magnitude"] is not None else "M?.?"
        depth_str = f"{e['depth_km']:.1f}km" if e["depth_km"] is not None else "?km"
        print(f"\n  {mag_str}  {e['type']:<16} {depth_str:<10} {flag_str}")
        print(f"       📍 {e['place']}")
        print(f"       🕐 {e['time']}")
        if e.get("latitude") and e.get("longitude"):
            print(f"       📐 {e['latitude']:.3f}°N, {e['longitude']:.3f}°E")

    # Summary
    explosions = [e for e in events if e["flags"] and any("EXPLOSION" in f for f in e["flags"])]
    shallow = [e for e in events if e["flags"] and any("SHALLOW" in f for f in e["flags"])]
    if explosions:
        print(f"\n🚨 ALERT: {len(explosions)} explosion(s) detected!")
    if shallow:
        print(f"\n⚠️  WARNING: {len(shallow)} shallow event(s) < 5km depth")


def main():
    parser = argparse.ArgumentParser(description="USGS Earthquake/Explosion Monitor")
    parser.add_argument("--region", "-r", default="iran",
                        help=f"Preset region: {', '.join(REGIONS)} (default: iran)")
    parser.add_argument("--hours", "-t", type=int, default=48,
                        help="Look-back hours (default: 48)")
    parser.add_argument("--min-mag", "-m", type=float, default=2.0,
                        help="Minimum magnitude (default: 2.0)")
    parser.add_argument("--json", "-j", action="store_true",
                        help="Output JSON")
    args = parser.parse_args()

    data = fetch_events(args.region, args.hours, args.min_mag)
    events = parse_events(data)

    if args.json:
        output = {
            "region": args.region,
            "hours": args.hours,
            "min_magnitude": args.min_mag,
            "total_events": len(events),
            "explosions": len([e for e in events if any("EXPLOSION" in f for f in e.get("flags", []))]),
            "shallow_events": len([e for e in events if any("SHALLOW" in f for f in e.get("flags", []))]),
            "events": events,
        }
        print(json.dumps(output, indent=2, ensure_ascii=False))
    else:
        print_human(events, args.region, args.hours)


if __name__ == "__main__":
    main()
