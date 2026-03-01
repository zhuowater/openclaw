#!/usr/bin/env python3
"""
OpenSky ADS-B Aircraft Scanner
Queries OpenSky Network REST API for aircraft in a geographic region.
Outputs JSON summary for intelligence analysis.
"""
import json, sys, subprocess, os, argparse
from datetime import datetime, timezone

PROXY = os.environ.get("SOCKS_PROXY", "")
BASE_URL = "https://opensky-network.org/api"

# Preset regions for intelligence monitoring
REGIONS = {
    "iran": {"lamin": 25.0, "lomin": 44.0, "lamax": 40.0, "lomax": 63.5, "desc": "Iran full territory"},
    "hormuz": {"lamin": 24.5, "lomin": 54.0, "lamax": 27.5, "lomax": 58.0, "desc": "Strait of Hormuz"},
    "persian_gulf": {"lamin": 24.0, "lomin": 48.0, "lamax": 30.5, "lomax": 56.5, "desc": "Persian Gulf"},
    "iraq_syria": {"lamin": 29.0, "lomin": 35.0, "lamax": 37.5, "lomax": 48.5, "desc": "Iraq + Syria corridor"},
    "israel": {"lamin": 29.0, "lomin": 34.0, "lamax": 33.5, "lomax": 36.0, "desc": "Israel airspace"},
    "gulf_of_oman": {"lamin": 22.0, "lomin": 56.0, "lamax": 26.5, "lomax": 62.0, "desc": "Gulf of Oman"},
    "middle_east": {"lamin": 22.0, "lomin": 34.0, "lamax": 40.0, "lomax": 63.5, "desc": "Full Middle East"},
}

# Known military ICAO24 prefixes (partial list)
MIL_PREFIXES = {
    "ae": "US Military", "af": "US Military",
    "43c": "UK Military", "3f": "Germany Military",
    "738": "Israel IAF", "739": "Israel IAF",
    "730": "Iran IRIAF", "731": "Iran IRIAF",
}

def curl_text(url):
    """Fetch URL via proxy (if set), return text."""
    cmd = ["curl", "-s", "--max-time", "15"]
    if PROXY:
        cmd.extend(["-x", PROXY])
    cmd.append(url)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    if result.returncode != 0:
        raise RuntimeError(f"curl failed: {result.stderr}")
    return result.stdout

def classify_aircraft(icao24):
    """Try to identify military aircraft by ICAO24 prefix."""
    icao = icao24.lower()
    for prefix, mil_type in MIL_PREFIXES.items():
        if icao.startswith(prefix):
            return mil_type
    return None

def scan_region(region_name, bbox=None):
    """Scan a region for aircraft."""
    if bbox is None:
        if region_name not in REGIONS:
            print(f"Unknown region: {region_name}", file=sys.stderr)
            print(f"Available: {', '.join(REGIONS.keys())}", file=sys.stderr)
            sys.exit(1)
        bbox = REGIONS[region_name]

    params = f"lamin={bbox['lamin']}&lomin={bbox['lomin']}&lamax={bbox['lamax']}&lomax={bbox['lomax']}"
    url = f"{BASE_URL}/states/all?{params}"

    raw = curl_text(url)
    if not raw.strip():
        return {"error": "Empty response from OpenSky API", "region": region_name}

    data = json.loads(raw)
    states = data.get("states", []) or []

    # Parse state vectors
    # [0]=icao24, [1]=callsign, [2]=origin_country, [3]=time_position,
    # [4]=last_contact, [5]=longitude, [6]=latitude, [7]=baro_altitude,
    # [8]=on_ground, [9]=velocity, [10]=true_track, [11]=vertical_rate,
    # [12]=sensors, [13]=geo_altitude, [14]=squawk, [15]=spi, [16]=position_source
    aircraft = []
    mil_count = 0
    country_stats = {}
    high_alt = []  # >10000m = likely military/long-range
    low_alt = []   # <500m = likely military/helicopter

    for s in states:
        icao24 = s[0] or ""
        callsign = (s[1] or "").strip()
        country = s[2] or "Unknown"
        lon = s[5]
        lat = s[6]
        alt = s[7] or s[13] or 0  # baro or geo altitude
        on_ground = s[8]
        velocity = s[9] or 0
        track = s[10] or 0
        squawk = s[14] or ""

        mil_type = classify_aircraft(icao24)
        if mil_type:
            mil_count += 1

        country_stats[country] = country_stats.get(country, 0) + 1

        entry = {
            "icao24": icao24,
            "callsign": callsign,
            "country": country,
            "lat": lat,
            "lon": lon,
            "altitude_m": round(alt) if alt else 0,
            "velocity_ms": round(velocity, 1) if velocity else 0,
            "on_ground": on_ground,
            "squawk": squawk,
        }
        if mil_type:
            entry["military"] = mil_type

        aircraft.append(entry)

        if alt and alt > 10000 and not on_ground:
            high_alt.append(entry)
        if alt and 0 < alt < 500 and not on_ground:
            low_alt.append(entry)

    # Sort countries by count
    country_sorted = sorted(country_stats.items(), key=lambda x: -x[1])

    result = {
        "scan_time": datetime.now(timezone.utc).isoformat(),
        "region": region_name,
        "region_desc": bbox.get("desc", region_name),
        "total_aircraft": len(aircraft),
        "military_identified": mil_count,
        "on_ground": sum(1 for a in aircraft if a["on_ground"]),
        "airborne": sum(1 for a in aircraft if not a["on_ground"]),
        "high_altitude_10km_plus": len(high_alt),
        "low_altitude_500m_minus": len(low_alt),
        "countries": dict(country_sorted[:15]),
        "military_aircraft": [a for a in aircraft if a.get("military")],
        "high_altitude_aircraft": sorted(high_alt, key=lambda x: -x["altitude_m"])[:10],
        "low_altitude_aircraft": low_alt[:10],
        "interesting_squawks": [a for a in aircraft if a["squawk"] in ("7500", "7600", "7700")],
    }

    return result


def main():
    parser = argparse.ArgumentParser(description="OpenSky ADS-B Aircraft Scanner")
    parser.add_argument("--region", default="iran", help=f"Region preset: {', '.join(REGIONS.keys())}")
    parser.add_argument("--bbox", help="Custom bbox: lamin,lomin,lamax,lomax")
    parser.add_argument("--multi", action="store_true", help="Scan iran + hormuz + persian_gulf")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    args = parser.parse_args()

    if args.multi:
        regions = ["iran", "hormuz", "persian_gulf"]
        results = {}
        for r in regions:
            try:
                results[r] = scan_region(r)
            except Exception as e:
                results[r] = {"error": str(e)}
        if args.json:
            print(json.dumps(results, indent=2))
        else:
            for r, data in results.items():
                print_summary(r, data)
        return

    bbox = None
    if args.bbox:
        parts = [float(x) for x in args.bbox.split(",")]
        bbox = {"lamin": parts[0], "lomin": parts[1], "lamax": parts[2], "lomax": parts[3], "desc": "custom"}

    try:
        result = scan_region(args.region, bbox)
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print_summary(args.region, result)


def print_summary(region, data):
    if "error" in data:
        print(f"❌ {region}: {data['error']}")
        return

    print(f"\n{'='*60}")
    print(f"✈️  ADS-B Scan: {data['region_desc']}")
    print(f"    Time: {data['scan_time']}")
    print(f"{'='*60}")
    print(f"  Total aircraft: {data['total_aircraft']}")
    print(f"  Airborne: {data['airborne']} | On ground: {data['on_ground']}")
    print(f"  Military identified: {data['military_identified']}")
    print(f"  High altitude (>10km): {data['high_altitude_10km_plus']}")
    print(f"  Low altitude (<500m): {data['low_altitude_500m_minus']}")

    if data['countries']:
        print(f"\n  Top countries:")
        for c, n in list(data['countries'].items())[:8]:
            print(f"    {c}: {n}")

    if data['military_aircraft']:
        print(f"\n  🎖️ Military aircraft:")
        for a in data['military_aircraft'][:10]:
            print(f"    {a['military']} | {a['callsign'] or a['icao24']} | alt:{a['altitude_m']}m | {a['lat']:.2f},{a['lon']:.2f}")

    if data['interesting_squawks']:
        print(f"\n  🚨 Emergency squawks:")
        for a in data['interesting_squawks']:
            codes = {"7500": "HIJACK", "7600": "RADIO FAIL", "7700": "EMERGENCY"}
            print(f"    {codes.get(a['squawk'], a['squawk'])} | {a['callsign'] or a['icao24']}")

    if data['high_altitude_aircraft']:
        print(f"\n  ⬆️ Highest aircraft:")
        for a in data['high_altitude_aircraft'][:5]:
            mil = f" [{a['military']}]" if a.get('military') else ""
            print(f"    {a['callsign'] or a['icao24']}{mil} | {a['altitude_m']}m | {a['country']}")


if __name__ == "__main__":
    main()
