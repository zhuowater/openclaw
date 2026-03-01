#!/usr/bin/env python3
"""
WebSDR/KiwiSDR Monitor
Track online shortwave radio receivers, detect outages in conflict zones.
"""
import json, sys, os, argparse, subprocess, re
from datetime import datetime, timezone
from math import radians, sin, cos, sqrt, atan2

KIWISDR_LIST = "http://rx.linkfanel.net/kiwisdr_com.js"

REGIONS = {
    "middle_east": {"lat": [20, 42], "lon": [30, 65]},
    "iran": {"lat": [25, 40], "lon": [44, 63]},
    "israel": {"lat": [29, 34], "lon": [34, 36]},
    "europe": {"lat": [35, 72], "lon": [-10, 40]},
    "global": {"lat": [-90, 90], "lon": [-180, 180]},
}

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1-a))

def fetch_kiwisdr_list():
    cmd = ["curl", "-s", "--max-time", "15", KIWISDR_LIST]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    if result.returncode != 0:
        return None
    
    # Parse JavaScript array
    text = result.stdout
    # Extract JSON array from JS variable assignment
    match = re.search(r'\[[\s\S]*\]', text)
    if not match:
        return None
    
    try:
        return json.loads(match.group(0))
    except:
        # Try fixing common JS issues
        cleaned = match.group(0)
        cleaned = re.sub(r',\s*]', ']', cleaned)
        cleaned = re.sub(r',\s*}', '}', cleaned)
        try:
            return json.loads(cleaned)
        except:
            return None

def scan_region(receivers, region_name):
    bounds = REGIONS.get(region_name, REGIONS["global"])
    lat_min, lat_max = bounds["lat"]
    lon_min, lon_max = bounds["lon"]
    
    regional = []
    for rx in receivers:
        gps = rx.get("gps", "")
        lat, lon = 0, 0
        if isinstance(gps, str):
            m = re.match(r'\(([^,]+),\s*([^)]+)\)', gps)
            if m:
                try:
                    lat, lon = float(m.group(1)), float(m.group(2))
                except: pass
        elif isinstance(gps, list) and len(gps) >= 2:
            lat, lon = float(gps[0]), float(gps[1])
        
        if lat_min <= lat <= lat_max and lon_min <= lon <= lon_max:
            regional.append({
                "name": rx.get("name", "?"),
                "url": rx.get("url", ""),
                "lat": lat,
                "lon": lon,
                "users": int(rx.get("users", 0)),
                "users_max": int(rx.get("users_max", 0)),
                "status": rx.get("status", ""),
                "offline": rx.get("offline", ""),
                "location": rx.get("loc", ""),
                "bands": rx.get("bands", ""),
            })
    
    online = [r for r in regional if r.get("offline") == "no" or r.get("status") == "active"]
    offline = [r for r in regional if r not in online]
    
    return {
        "scan_time": datetime.now(timezone.utc).isoformat(),
        "region": region_name,
        "total": len(regional),
        "online": len(online),
        "offline": len(offline),
        "online_pct": round(len(online) / len(regional) * 100, 1) if regional else 0,
        "receivers": regional,
    }

def print_summary(result):
    print(f"\n{'='*60}")
    print(f"📻 WebSDR/KiwiSDR: {result['region'].upper()}")
    print(f"   Total: {result['total']} | Online: {result['online']} | Offline: {result['offline']}")
    print(f"   Online rate: {result['online_pct']}%")
    print(f"{'='*60}")
    for rx in result.get("receivers", [])[:15]:
        status = "🟢" if rx.get("offline") == "no" else "🔴"
        users = f"{rx.get('users',0)}/{rx.get('users_max',0)}" if rx.get("users_max") else str(rx.get("users", "?"))
        print(f"  {status} {rx['name'][:40]:40} | {rx.get('location','')[:20]:20} | users: {users}")
        if rx.get("url"):
            print(f"     {rx['url']}")

def main():
    parser = argparse.ArgumentParser(description="WebSDR/KiwiSDR Monitor")
    parser.add_argument("--region", default="middle_east", choices=list(REGIONS.keys()))
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    
    receivers = fetch_kiwisdr_list()
    if not receivers:
        print(json.dumps({"error": "Failed to fetch KiwiSDR list"}) if args.json else "❌ Failed to fetch KiwiSDR list")
        return
    
    result = scan_region(receivers, args.region)
    
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print_summary(result)

if __name__ == "__main__":
    main()
