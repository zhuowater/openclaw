#!/usr/bin/env python3
"""Analyze FIRMS fire data for Iran - detect potential military strikes"""
import csv, io, subprocess, json
from collections import defaultdict

FIRMS_KEY = "e4b715bb6e6eeec9290fbd19fef9efe6"
PROXY = "socks5h://127.0.0.1:7880"
# Iran bbox
URL = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{FIRMS_KEY}/VIIRS_SNPP_NRT/44,25,64,40/1"

# Known military/strategic sites (approximate)
TARGETS = {
    "Isfahan Nuclear": (32.65, 51.68, 30),  # lat, lon, radius_km
    "Natanz Enrichment": (33.72, 51.73, 20),
    "Fordow Underground": (34.88, 51.59, 15),
    "Bushehr Nuclear": (28.83, 50.88, 20),
    "Parchin Military": (35.52, 51.77, 15),
    "Tehran (Capital)": (35.69, 51.39, 30),
    "Bandar Abbas Naval": (27.18, 56.28, 20),
    "Kharg Island Oil": (29.24, 50.33, 15),
    "Abadan Refinery": (30.34, 48.30, 15),
    "Isfahan Refinery": (32.62, 51.67, 15),
    "Hormuz Strait": (26.60, 56.30, 40),
    "Chabahar Port": (25.30, 60.64, 20),
    "Shiraz AFB": (29.54, 52.59, 20),
    "Tabriz AFB": (38.13, 46.24, 20),
    "Dezful Missile Base": (32.38, 48.40, 20),
}

def haversine_km(lat1, lon1, lat2, lon2):
    from math import radians, sin, cos, sqrt, atan2
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1-a))

result = subprocess.run(
    ["curl", "-s", "--max-time", "15", URL, "-x", PROXY],
    capture_output=True, text=True, timeout=20
)

reader = csv.DictReader(io.StringIO(result.stdout))
fires = list(reader)

print(f"🛰️ NASA FIRMS Iran Fire Detection Report")
print(f"📅 Data: Last 24 hours | Points: {len(fires)}")
print(f"{'='*60}\n")

# High confidence/high FRP fires near known targets
alerts = []
high_frp = []

for f in fires:
    lat = float(f['latitude'])
    lon = float(f['longitude'])
    frp = float(f.get('frp', 0))
    conf = f.get('confidence', 'l')
    time = f.get('acq_time', '?')
    bright = float(f.get('bright_ti4', 0))
    
    # Check proximity to known targets
    for name, (tlat, tlon, radius) in TARGETS.items():
        dist = haversine_km(lat, lon, tlat, tlon)
        if dist < radius:
            alerts.append({
                'target': name,
                'dist_km': dist,
                'lat': lat, 'lon': lon,
                'frp': frp, 'confidence': conf,
                'time': time, 'bright': bright
            })
    
    # High FRP = large fire/explosion
    if frp > 50:
        high_frp.append({
            'lat': lat, 'lon': lon,
            'frp': frp, 'confidence': conf,
            'time': time, 'bright': bright
        })

# Report target-proximate fires
if alerts:
    print("🔴 FIRES NEAR KNOWN STRATEGIC SITES:")
    by_target = defaultdict(list)
    for a in alerts:
        by_target[a['target']].append(a)
    for target, fires_list in sorted(by_target.items(), key=lambda x: -max(f['frp'] for f in x[1])):
        max_frp = max(f['frp'] for f in fires_list)
        print(f"\n  📍 {target} ({len(fires_list)} detections, max FRP: {max_frp:.0f} MW)")
        for f in sorted(fires_list, key=lambda x: -x['frp'])[:3]:
            print(f"     [{f['time']}] {f['lat']:.3f},{f['lon']:.3f} "
                  f"FRP:{f['frp']:.0f}MW conf:{f['confidence']} "
                  f"dist:{f['dist_km']:.0f}km bright:{f['bright']:.0f}K")
else:
    print("✅ No fires detected near known strategic sites")

# Report high-FRP fires anywhere
if high_frp:
    print(f"\n🟡 HIGH-ENERGY FIRES (FRP>50MW) — {len(high_frp)} detections:")
    for f in sorted(high_frp, key=lambda x: -x['frp'])[:10]:
        print(f"  [{f['time']}] {f['lat']:.3f},{f['lon']:.3f} "
              f"FRP:{f['frp']:.0f}MW conf:{f['confidence']} bright:{f['bright']:.0f}K")

# Summary stats
conf_counts = defaultdict(int)
for f in fires:
    conf_counts[f.get('confidence','?')] += 1
print(f"\n📊 Summary: {len(fires)} total | " + 
      " | ".join(f"{k}:{v}" for k,v in sorted(conf_counts.items())))
