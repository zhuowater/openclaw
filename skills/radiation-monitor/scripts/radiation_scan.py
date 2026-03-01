#!/usr/bin/env python3
"""
Radiation Monitor — OSINT Radiation Surveillance
Primary source: Safecast API (crowdsourced, free, global)
Fallback: gmcmap.com, netc.com (public radiation maps)

Monitors radiation levels near nuclear facilities.
"""
import json, sys, subprocess, os, argparse, math
from datetime import datetime, timezone, timedelta

PROXY = os.environ.get("SOCKS_PROXY", "")

# Safecast API (primary — crowdsourced, free, no key)
SAFECAST_URL = "https://api.safecast.org/measurements.json"

# CPM to μSv/h conversion factors by sensor type
# LND-7128EC (pancake GM tube): ~334 CPM per μSv/h
# LND-7318U: ~108 CPM per μSv/h
# Generic: ~120 CPM per μSv/h (rough average)
CPM_FACTORS = {
    "lnd_7128ec": 334,
    "lnd_7318u": 108,
    "lnd_712": 120,
    "default": 120,
}

# Radiation baselines
NORMAL_BACKGROUND = (0.05, 0.20)   # μSv/h normal range
ELEVATED_THRESHOLD = 0.50           # μSv/h — warrants attention
ALERT_THRESHOLD = 1.0               # μSv/h — significant
DANGER_THRESHOLD = 10.0             # μSv/h — dangerous

# Preset locations: Iranian nuclear facilities
LOCATIONS = {
    "natanz":    {"lon": 51.727, "lat": 33.721, "desc": "Natanz uranium enrichment facility"},
    "fordow":    {"lon": 51.567, "lat": 34.880, "desc": "Fordow underground enrichment facility"},
    "bushehr":   {"lon": 50.886, "lat": 28.831, "desc": "Bushehr nuclear power plant"},
    "isfahan":   {"lon": 51.677, "lat": 32.652, "desc": "Isfahan nuclear technology center"},
    "tehran":    {"lon": 51.42,  "lat": 35.69,  "desc": "Tehran"},
    "arak":      {"lon": 49.28,  "lat": 34.09,  "desc": "Arak heavy water reactor"},
    # Reference cities with known Safecast coverage (for calibration)
    "tokyo":     {"lon": 139.69, "lat": 35.69,  "desc": "Tokyo (reference — good Safecast coverage)"},
    "fukushima": {"lon": 141.03, "lat": 37.42,  "desc": "Fukushima (reference — elevated baseline)"},
}


def curl_fetch(url, timeout=20):
    """Fetch URL via curl with optional proxy."""
    cmd = ["curl", "-s", "--max-time", str(timeout)]
    if PROXY:
        cmd.extend(["-x", PROXY])
    cmd.append(url)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 5)
    if result.returncode != 0:
        raise RuntimeError(f"curl failed: {result.stderr}")
    return result.stdout


def cpm_to_usv(cpm, device_type="default"):
    """Convert counts-per-minute to μSv/h."""
    factor = CPM_FACTORS.get(device_type, CPM_FACTORS["default"])
    return cpm / factor


def classify_level(usv):
    """Classify radiation level."""
    if usv < NORMAL_BACKGROUND[1]:
        return "🟢 NORMAL"
    elif usv < ELEVATED_THRESHOLD:
        return "🟡 SLIGHTLY ELEVATED"
    elif usv < ALERT_THRESHOLD:
        return "🟠 ELEVATED"
    elif usv < DANGER_THRESHOLD:
        return "🔴 HIGH"
    else:
        return "☢️ DANGER"


def haversine_km(lat1, lon1, lat2, lon2):
    """Distance between two points in km."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))


def query_safecast(lat, lon, radius_km=1000, limit=50):
    """Query Safecast API for radiation measurements near a point."""
    # Safecast uses distance in meters
    distance_m = radius_km * 1000
    url = (f"{SAFECAST_URL}?"
           f"latitude={lat}&longitude={lon}"
           f"&distance={distance_m}"
           f"&limit={limit}"
           f"&order=captured_at+desc")

    raw = curl_fetch(url)
    if not raw.strip():
        return []

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []

    measurements = []
    for m in data:
        cpm = m.get("value")
        if cpm is None:
            continue

        device_type = m.get("devicetype_id", "default")
        usv = cpm_to_usv(cpm, device_type)
        dist = haversine_km(lat, lon, m.get("latitude", 0), m.get("longitude", 0))

        measurements.append({
            "value_cpm": cpm,
            "value_usv_h": round(usv, 4),
            "level": classify_level(usv),
            "latitude": m.get("latitude"),
            "longitude": m.get("longitude"),
            "distance_km": round(dist, 1),
            "captured_at": m.get("captured_at", ""),
            "device_id": m.get("device_id"),
            "device_type": device_type,
            "unit": m.get("unit", "cpm"),
            "height_m": m.get("height"),
        })

    # Sort by distance
    measurements.sort(key=lambda x: x["distance_km"])
    return measurements


def query_netc(lat, lon, radius_km=500):
    """
    Fallback: Try netc.com (Radiation Network) for nearby stations.
    This is a screen-scraping approach — fragile but useful.
    """
    # netc.com has a JSON data feed for station markers
    url = "https://www.netc.com/data/map_data.txt"
    try:
        raw = curl_fetch(url, timeout=15)
        if not raw.strip() or raw.startswith("<!"):
            return []

        # Try to parse as JSON or CSV
        stations = []
        try:
            data = json.loads(raw)
            for station in data:
                slat = station.get("lat", station.get("Lat", 0))
                slon = station.get("lon", station.get("Lon", station.get("Long", 0)))
                if slat and slon:
                    dist = haversine_km(lat, lon, float(slat), float(slon))
                    if dist <= radius_km:
                        cpm = station.get("cpm", station.get("CPM", 0))
                        stations.append({
                            "source": "netc.com",
                            "value_cpm": cpm,
                            "value_usv_h": round(cpm / 120, 4) if cpm else None,
                            "latitude": float(slat),
                            "longitude": float(slon),
                            "distance_km": round(dist, 1),
                            "station_id": station.get("id", ""),
                        })
        except (json.JSONDecodeError, ValueError):
            pass

        stations.sort(key=lambda x: x["distance_km"])
        return stations[:20]

    except Exception:
        return []


def scan_location(lat, lon, location_name="custom", radius_km=1000):
    """Scan a location using all available sources."""
    results = {
        "scan_time": datetime.now(timezone.utc).isoformat(),
        "location": location_name,
        "coordinates": {"lat": lat, "lon": lon},
        "radius_km": radius_km,
        "sources": {},
        "summary": {},
    }

    # Try Safecast
    try:
        safecast_data = query_safecast(lat, lon, radius_km)
        results["sources"]["safecast"] = {
            "status": "ok" if safecast_data else "no_data",
            "count": len(safecast_data),
            "measurements": safecast_data,
        }
    except Exception as e:
        results["sources"]["safecast"] = {"status": "error", "error": str(e)}

    # Try netc.com fallback
    try:
        netc_data = query_netc(lat, lon, radius_km)
        if netc_data:
            results["sources"]["netc"] = {
                "status": "ok",
                "count": len(netc_data),
                "stations": netc_data,
            }
    except Exception:
        pass

    # Build summary from best available data
    all_readings = []
    safecast_src = results["sources"].get("safecast", {})
    if safecast_src.get("status") == "ok":
        all_readings.extend(safecast_src.get("measurements", []))

    if all_readings:
        usv_values = [r["value_usv_h"] for r in all_readings if r.get("value_usv_h") is not None]
        if usv_values:
            avg_usv = sum(usv_values) / len(usv_values)
            max_usv = max(usv_values)
            min_usv = min(usv_values)
            results["summary"] = {
                "total_readings": len(usv_values),
                "avg_usv_h": round(avg_usv, 4),
                "max_usv_h": round(max_usv, 4),
                "min_usv_h": round(min_usv, 4),
                "overall_level": classify_level(avg_usv),
                "normal_range": f"{NORMAL_BACKGROUND[0]}-{NORMAL_BACKGROUND[1]} μSv/h",
                "nearest_reading_km": all_readings[0]["distance_km"] if all_readings else None,
                "latest_reading": all_readings[0].get("captured_at") if all_readings else None,
            }
    else:
        results["summary"] = {
            "total_readings": 0,
            "note": "No radiation data available near this location. "
                    "Safecast coverage is sparse in Iran/Middle East. "
                    "Try --location tokyo or --location fukushima for reference data."
        }

    return results


def main():
    parser = argparse.ArgumentParser(description="Radiation Monitor — OSINT Radiation Surveillance")
    parser.add_argument("--location", "-l", help=f"Preset location: {', '.join(LOCATIONS.keys())}")
    parser.add_argument("--lat", type=float, help="Latitude")
    parser.add_argument("--lon", type=float, help="Longitude")
    parser.add_argument("--radius", type=float, default=1000, help="Search radius in km (default: 1000)")
    parser.add_argument("--all-locations", action="store_true", help="Scan all preset locations")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    parser.add_argument("--list-locations", action="store_true", help="List preset locations")
    args = parser.parse_args()

    if args.list_locations:
        for name, info in LOCATIONS.items():
            print(f"  {name:15s}  ({info['lon']:.3f}, {info['lat']:.3f})  {info['desc']}")
        return

    if args.all_locations:
        all_results = {}
        for name, info in LOCATIONS.items():
            try:
                all_results[name] = scan_location(info["lat"], info["lon"], name, args.radius)
            except Exception as e:
                all_results[name] = {"error": str(e)}

        if args.json:
            print(json.dumps(all_results, indent=2))
        else:
            for name, data in all_results.items():
                print_summary(name, data)
        return

    # Single location
    if args.location:
        if args.location not in LOCATIONS:
            print(f"Unknown location: {args.location}", file=sys.stderr)
            print(f"Available: {', '.join(LOCATIONS.keys())}", file=sys.stderr)
            sys.exit(1)
        loc = LOCATIONS[args.location]
        lat, lon = loc["lat"], loc["lon"]
        loc_name = args.location
    elif args.lat is not None and args.lon is not None:
        lat, lon = args.lat, args.lon
        loc_name = f"custom ({lat:.3f}, {lon:.3f})"
    else:
        parser.print_help()
        sys.exit(1)

    try:
        result = scan_location(lat, lon, loc_name, args.radius)
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print_summary(loc_name, result)


def print_summary(loc_name, data):
    if "error" in data and isinstance(data["error"], str):
        print(f"❌ {loc_name}: {data['error']}")
        return

    summary = data.get("summary", {})
    coords = data.get("coordinates", {})

    print(f"\n{'='*60}")
    print(f"☢️  Radiation Monitor: {loc_name}")
    print(f"    Coordinates: ({coords.get('lat', '?')}, {coords.get('lon', '?')})")
    print(f"    Radius: {data.get('radius_km', '?')} km")
    print(f"    Time: {data.get('scan_time', '?')}")
    print(f"{'='*60}")

    if summary.get("total_readings", 0) == 0:
        print(f"  ⚠️  No readings found nearby")
        if summary.get("note"):
            print(f"  📝 {summary['note']}")
        return

    print(f"  Status: {summary.get('overall_level', '?')}")
    print(f"  Average: {summary.get('avg_usv_h', '?')} μSv/h")
    print(f"  Range: {summary.get('min_usv_h', '?')} — {summary.get('max_usv_h', '?')} μSv/h")
    print(f"  Normal background: {NORMAL_BACKGROUND[0]}-{NORMAL_BACKGROUND[1]} μSv/h")
    print(f"  Readings: {summary.get('total_readings', 0)}")
    print(f"  Nearest: {summary.get('nearest_reading_km', '?')} km away")
    print(f"  Latest: {summary.get('latest_reading', '?')}")

    # Show sources
    for src_name, src_data in data.get("sources", {}).items():
        status = src_data.get("status", "?")
        count = src_data.get("count", 0)
        print(f"\n  📡 {src_name}: {status} ({count} readings)")

        readings = src_data.get("measurements", src_data.get("stations", []))
        for r in readings[:5]:
            usv = r.get("value_usv_h", "?")
            dist = r.get("distance_km", "?")
            time = r.get("captured_at", "")[:16]
            level = r.get("level", "")
            print(f"    {usv} μSv/h | {dist} km | {time} {level}")

    print(f"\n  💡 Thresholds: Normal <{NORMAL_BACKGROUND[1]} | Elevated >{ELEVATED_THRESHOLD}"
          f" | Alert >{ALERT_THRESHOLD} | Danger >{DANGER_THRESHOLD} μSv/h")


if __name__ == "__main__":
    main()
