#!/usr/bin/env python3
"""
GPS Jamming Detection via ADS-B Navigation Anomalies
Indirect GPS interference detection using aircraft navigation data.
"""
import json, sys, os, argparse, subprocess
from datetime import datetime, timezone

ADSB_SCRIPT = "/root/openclaw/skills/opensky-adsb/scripts/adsb_scan.py"

REGIONS = {
    "iran": {"lat": [25, 40], "lon": [44, 63]},
    "israel": {"lat": [29, 34], "lon": [34, 36]},
    "hormuz": {"lat": [24, 28], "lon": [54, 58]},
    "middle_east": {"lat": [20, 42], "lon": [30, 65]},
}

# Emergency squawk codes
SQUAWK_MEANINGS = {
    "7500": "HIJACK",
    "7600": "RADIO FAILURE (possible jamming)",
    "7700": "GENERAL EMERGENCY",
}

def get_adsb_data(region):
    r = REGIONS.get(region, REGIONS["middle_east"])
    cmd = ["python3", ADSB_SCRIPT, "--region", region, "--json"]
    env = os.environ.copy()
    env["SOCKS_PROXY"] = ""
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, env=env)
    if result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout)
    except:
        return None

def analyze_jamming(data):
    if not data:
        return {"error": "No ADS-B data available"}
    
    aircraft = data.get("aircraft", [])
    total = len(aircraft)
    
    anomalies = []
    emergency_squawks = []
    no_position = 0
    
    for ac in aircraft:
        callsign = ac.get("callsign", "?").strip()
        squawk = ac.get("squawk", "")
        lat = ac.get("latitude")
        lon = ac.get("longitude")
        alt = ac.get("baro_altitude")
        on_ground = ac.get("on_ground", False)
        
        # Check emergency squawks
        if squawk in SQUAWK_MEANINGS:
            emergency_squawks.append({
                "callsign": callsign,
                "squawk": squawk,
                "meaning": SQUAWK_MEANINGS[squawk],
                "lat": lat, "lon": lon,
            })
        
        # No position = possible GPS denial
        if lat is None and lon is None and not on_ground:
            no_position += 1
            anomalies.append({
                "type": "NO_POSITION",
                "callsign": callsign,
                "detail": "Airborne with no GPS position",
            })
    
    no_pos_pct = (no_position / total * 100) if total > 0 else 0
    
    # Jamming assessment
    if len(emergency_squawks) > 0 and no_pos_pct > 30:
        status = "🔴 ACTIVE GPS JAMMING LIKELY"
    elif no_pos_pct > 20:
        status = "🟠 POSSIBLE GPS INTERFERENCE"
    elif len(emergency_squawks) > 0:
        status = "🟡 EMERGENCY SQUAWKS DETECTED"
    elif total == 0:
        status = "⚪ NO AIRCRAFT (airspace closed)"
    else:
        status = "🟢 NORMAL"
    
    return {
        "scan_time": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "total_aircraft": total,
        "no_position_count": no_position,
        "no_position_pct": round(no_pos_pct, 1),
        "emergency_squawks": emergency_squawks,
        "anomalies": anomalies[:10],
    }

def print_summary(result, region):
    print(f"\n{'='*60}")
    print(f"📡 GPS Jamming Analysis: {region.upper()}")
    print(f"   Status: {result['status']}")
    print(f"   Aircraft: {result['total_aircraft']}")
    print(f"   No GPS position: {result['no_position_count']} ({result['no_position_pct']}%)")
    print(f"{'='*60}")
    if result.get("emergency_squawks"):
        print(f"\n  ⚠️ Emergency Squawks:")
        for s in result["emergency_squawks"]:
            print(f"    {s['callsign']} → {s['squawk']} ({s['meaning']})")
    if result.get("anomalies"):
        print(f"\n  Navigation Anomalies:")
        for a in result["anomalies"][:5]:
            print(f"    {a['callsign']}: {a['detail']}")

def main():
    parser = argparse.ArgumentParser(description="GPS Jamming Detection via ADS-B")
    parser.add_argument("--region", default="middle_east", choices=list(REGIONS.keys()))
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    
    data = get_adsb_data(args.region)
    result = analyze_jamming(data)
    result["region"] = args.region
    
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print_summary(result, args.region)

if __name__ == "__main__":
    main()
