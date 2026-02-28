#!/usr/bin/env python3
"""
NASA FIRMS Satellite Fire Detection Scanner
Detects fire/explosion/thermal anomalies near strategic targets worldwide.

Usage:
  python3 firms_scan.py --region iran          # Preset region with targets
  python3 firms_scan.py --bbox 44,25,64,40     # Custom bounding box
  python3 firms_scan.py --region iran --json    # JSON output
  python3 firms_scan.py --region iran --days 3  # Multi-day scan
"""

import argparse, csv, io, json, os, subprocess, sys
from collections import defaultdict
from math import radians, sin, cos, sqrt, atan2

# ============ Configuration ============

FIRMS_KEY = os.environ.get("FIRMS_MAP_KEY", "")
PROXY = os.environ.get("SOCKS_PROXY", "socks5h://127.0.0.1:7880")
FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"

# Load key from .env if not in environment
if not FIRMS_KEY:
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")
    if os.path.exists(env_path):
        for line in open(env_path):
            if line.startswith("FIRMS_MAP_KEY="):
                FIRMS_KEY = line.strip().split("=", 1)[1]
    # Also try /root/openclaw/.env
    alt_env = "/root/openclaw/.env"
    if not FIRMS_KEY and os.path.exists(alt_env):
        for line in open(alt_env):
            if line.startswith("FIRMS_MAP_KEY="):
                FIRMS_KEY = line.strip().split("=", 1)[1]

# ============ Preset Regions & Targets ============

REGIONS = {
    "iran": {
        "bbox": "44,25,64,40",
        "targets": {
            "Isfahan Nuclear":     (32.65, 51.68, 30),
            "Natanz Enrichment":   (33.72, 51.73, 20),
            "Fordow Underground":  (34.88, 51.59, 15),
            "Bushehr Nuclear":     (28.83, 50.88, 20),
            "Parchin Military":    (35.52, 51.77, 15),
            "Tehran (Capital)":    (35.69, 51.39, 30),
            "Bandar Abbas Naval":  (27.18, 56.28, 20),
            "Kharg Island Oil":    (29.24, 50.33, 15),
            "Abadan Refinery":     (30.34, 48.30, 15),
            "Isfahan Refinery":    (32.62, 51.67, 15),
            "Hormuz Strait":       (26.60, 56.30, 40),
            "Chabahar Port":       (25.30, 60.64, 20),
            "Shiraz AFB":          (29.54, 52.59, 20),
            "Tabriz AFB":          (38.13, 46.24, 20),
            "Dezful Missile Base": (32.38, 48.40, 20),
        }
    },
    "ukraine": {
        "bbox": "22,44,40,53",
        "targets": {
            "Kyiv":              (50.45, 30.52, 30),
            "Zaporizhzhia NPP":  (47.51, 34.59, 20),
            "Odessa Port":       (46.48, 30.74, 15),
            "Kharkiv":           (49.99, 36.23, 20),
            "Crimea Bridge":     (45.31, 36.51, 10),
        }
    },
    "taiwan": {
        "bbox": "119,21,123,26",
        "targets": {
            "Taipei":            (25.03, 121.57, 20),
            "Kaohsiung Port":    (22.62, 120.31, 15),
            "Taichung AFB":      (24.26, 120.62, 10),
            "Hualien AFB":       (24.02, 121.62, 10),
        }
    },
    "mideast": {
        "bbox": "34,12,64,42",
        "targets": {}
    },
}

SOURCES = [
    "VIIRS_SNPP_NRT",
    "VIIRS_NOAA20_NRT",
    "VIIRS_NOAA21_NRT",
    "MODIS_NRT",
]

# ============ Utility Functions ============

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1-a))

def fetch_firms(bbox, source="VIIRS_SNPP_NRT", days=1):
    url = f"{FIRMS_BASE}/{FIRMS_KEY}/{source}/{bbox}/{days}"
    cmd = ["curl", "-s", "--max-time", "20", url]
    if PROXY:
        cmd.extend(["-x", PROXY])
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=25)
        if result.stdout.startswith("Invalid"):
            print(f"⚠️ API Error: {result.stdout.strip()}", file=sys.stderr)
            return []
        reader = csv.DictReader(io.StringIO(result.stdout))
        return list(reader)
    except Exception as e:
        print(f"⚠️ Fetch error: {e}", file=sys.stderr)
        return []

def analyze(fires, targets, extra_targets=None):
    all_targets = dict(targets)
    if extra_targets:
        all_targets.update(extra_targets)

    alerts = []
    high_frp = []
    conf_counts = defaultdict(int)

    for f in fires:
        try:
            lat = float(f['latitude'])
            lon = float(f['longitude'])
            frp = float(f.get('frp', 0))
            conf = f.get('confidence', 'l')
            time = f.get('acq_time', '?')
            date = f.get('acq_date', '?')
            bright = float(f.get('bright_ti4', 0))
        except (ValueError, KeyError):
            continue

        conf_counts[conf] += 1

        for name, (tlat, tlon, radius) in all_targets.items():
            dist = haversine_km(lat, lon, tlat, tlon)
            if dist < radius:
                alerts.append({
                    'target': name, 'dist_km': round(dist, 1),
                    'lat': lat, 'lon': lon, 'frp': frp,
                    'confidence': conf, 'time': time, 'date': date,
                    'bright': bright,
                })

        if frp > 50:
            high_frp.append({
                'lat': lat, 'lon': lon, 'frp': frp,
                'confidence': conf, 'time': time, 'date': date,
                'bright': bright,
            })

    return {
        'total_fires': len(fires),
        'target_alerts': alerts,
        'high_frp': sorted(high_frp, key=lambda x: -x['frp']),
        'confidence_dist': dict(conf_counts),
    }

def print_report(result):
    print(f"🛰️ NASA FIRMS Fire Detection Report")
    print(f"📅 Points: {result['total_fires']}")
    print(f"{'='*60}\n")

    alerts = result['target_alerts']
    if alerts:
        print("🔴 FIRES NEAR KNOWN STRATEGIC SITES:\n")
        by_target = defaultdict(list)
        for a in alerts:
            by_target[a['target']].append(a)
        for target, flist in sorted(by_target.items(), key=lambda x: -max(f['frp'] for f in x[1])):
            max_frp = max(f['frp'] for f in flist)
            severity = "🔴" if max_frp > 50 else "🟡" if max_frp > 10 else "⚪"
            print(f"  {severity} {target} ({len(flist)} detections, max FRP: {max_frp:.0f} MW)")
            for f in sorted(flist, key=lambda x: -x['frp'])[:5]:
                print(f"     [{f['date']} {f['time']}] {f['lat']:.3f},{f['lon']:.3f} "
                      f"FRP:{f['frp']:.0f}MW conf:{f['confidence']} "
                      f"dist:{f['dist_km']:.0f}km bright:{f['bright']:.0f}K")
            print()
    else:
        print("✅ No fires detected near known strategic sites\n")

    high_frp = result['high_frp']
    if high_frp:
        print(f"🟡 HIGH-ENERGY FIRES (FRP>50MW) — {len(high_frp)} detections:\n")
        for f in high_frp[:15]:
            print(f"  [{f['date']} {f['time']}] {f['lat']:.3f},{f['lon']:.3f} "
                  f"FRP:{f['frp']:.0f}MW conf:{f['confidence']} bright:{f['bright']:.0f}K")
        print()

    cd = result['confidence_dist']
    print(f"📊 Confidence: " + " | ".join(f"{k}:{v}" for k, v in sorted(cd.items())))

def main():
    parser = argparse.ArgumentParser(description="NASA FIRMS Fire Detection Scanner")
    parser.add_argument("--region", choices=list(REGIONS.keys()), help="Preset region")
    parser.add_argument("--bbox", help="Custom bounding box: west,south,east,north")
    parser.add_argument("--days", type=int, default=1, help="Day range (1-5)")
    parser.add_argument("--source", default="VIIRS_SNPP_NRT", choices=SOURCES, help="Satellite sensor")
    parser.add_argument("--target", action="append", help="Extra target: name:lat,lon,radius_km")
    parser.add_argument("--json", action="store_true", help="JSON output")
    parser.add_argument("--all-sources", action="store_true", help="Query all sensors and merge")
    args = parser.parse_args()

    if not FIRMS_KEY:
        print("❌ FIRMS_MAP_KEY not set. Register at https://firms.modaps.eosdis.nasa.gov/api/map_key/")
        sys.exit(1)

    if not args.region and not args.bbox:
        args.region = "iran"  # default

    bbox = REGIONS[args.region]["bbox"] if args.region else args.bbox
    targets = REGIONS.get(args.region, {}).get("targets", {}) if args.region else {}

    extra_targets = {}
    if args.target:
        for t in args.target:
            name, coords = t.split(":", 1)
            lat, lon, r = coords.split(",")
            extra_targets[name] = (float(lat), float(lon), float(r))

    # Fetch data
    if args.all_sources:
        all_fires = []
        for src in SOURCES:
            fires = fetch_firms(bbox, src, args.days)
            all_fires.extend(fires)
        # Deduplicate by lat/lon/time
        seen = set()
        fires = []
        for f in all_fires:
            key = (f.get('latitude'), f.get('longitude'), f.get('acq_time'))
            if key not in seen:
                seen.add(key)
                fires.append(f)
    else:
        fires = fetch_firms(bbox, args.source, args.days)

    result = analyze(fires, targets, extra_targets)

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print_report(result)

if __name__ == "__main__":
    main()
