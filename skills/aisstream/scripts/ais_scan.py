#!/usr/bin/env python3
"""
AIS Ship Scanner
Connects to AISStream.io WebSocket to capture vessel positions in a region.
Collects data for a configurable duration then outputs JSON summary.
"""
import json, sys, os, argparse, asyncio, ssl
from datetime import datetime, timezone

try:
    import websockets
    HAS_WS = True
except ImportError:
    HAS_WS = False

API_KEY = os.environ.get("AISSTREAM_API_KEY", "")

# Preset regions (bounding boxes [[lat_min, lon_min], [lat_max, lon_max]])
REGIONS = {
    "hormuz": {
        "bbox": [[24.5, 54.0], [27.5, 58.0]],
        "desc": "Strait of Hormuz"
    },
    "persian_gulf": {
        "bbox": [[24.0, 48.0], [30.5, 56.5]],
        "desc": "Persian Gulf"
    },
    "gulf_of_oman": {
        "bbox": [[22.0, 56.0], [26.5, 62.0]],
        "desc": "Gulf of Oman"
    },
    "red_sea": {
        "bbox": [[12.0, 32.0], [30.0, 44.0]],
        "desc": "Red Sea + Suez"
    },
    "bab_el_mandeb": {
        "bbox": [[11.5, 42.5], [13.5, 44.5]],
        "desc": "Bab el-Mandeb Strait"
    },
}

# Ship type codes (AIS)
SHIP_TYPES = {
    range(70, 80): "Cargo",
    range(80, 90): "Tanker",
    range(60, 70): "Passenger",
    range(40, 50): "High Speed",
    range(50, 60): "Special Craft",
    range(30, 40): "Fishing",
    range(20, 30): "Wing in Ground",
}

def get_ship_type(code):
    if not code: return "Unknown"
    code = int(code)
    for r, name in SHIP_TYPES.items():
        if code in r:
            return name
    if code in (35, 55): return "Military"
    return f"Other ({code})"


async def collect_ais(region_name, bbox, duration_sec=60):
    """Connect to AISStream and collect vessel data for duration."""
    if not HAS_WS:
        return {"error": "websockets not installed. Run: pip install websockets"}
    if not API_KEY:
        return {"error": "AISSTREAM_API_KEY not set. Get key at https://aisstream.io/apikeys"}

    url = "wss://stream.aisstream.io/v0/stream"
    subscribe = {
        "APIKey": API_KEY,
        "BoundingBoxes": [bbox],
        "FilterMessageTypes": ["PositionReport", "ShipStaticData"]
    }

    vessels = {}  # MMSI -> vessel data
    start = datetime.now(timezone.utc)

    try:
        ssl_ctx = ssl.create_default_context()
        async with websockets.connect(url, ssl=ssl_ctx) as ws:
            await ws.send(json.dumps(subscribe))

            while True:
                elapsed = (datetime.now(timezone.utc) - start).total_seconds()
                if elapsed >= duration_sec:
                    break

                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=max(1, duration_sec - elapsed))
                except asyncio.TimeoutError:
                    break

                data = json.loads(msg)
                msg_type = data.get("MessageType", "")
                meta = data.get("MetaData", {})
                mmsi = str(meta.get("MMSI", ""))

                if not mmsi:
                    continue

                if mmsi not in vessels:
                    vessels[mmsi] = {
                        "mmsi": mmsi,
                        "name": meta.get("ShipName", "").strip(),
                        "country": meta.get("country_iso3", ""),
                        "lat": meta.get("latitude", 0),
                        "lon": meta.get("longitude", 0),
                    }

                v = vessels[mmsi]

                if msg_type == "PositionReport":
                    pos = data.get("Message", {}).get("PositionReport", {})
                    v["lat"] = pos.get("Latitude", v["lat"])
                    v["lon"] = pos.get("Longitude", v["lon"])
                    v["speed_knots"] = pos.get("Sog", 0)
                    v["course"] = pos.get("Cog", 0)
                    v["nav_status"] = pos.get("NavigationalStatus", 0)

                elif msg_type == "ShipStaticData":
                    static = data.get("Message", {}).get("ShipStaticData", {})
                    v["name"] = static.get("Name", v.get("name", "")).strip()
                    v["ship_type_code"] = static.get("Type", 0)
                    v["ship_type"] = get_ship_type(static.get("Type", 0))
                    v["destination"] = static.get("Destination", "").strip()
                    v["draught"] = static.get("MaximumStaticDraught", 0)
                    dim = static.get("Dimension", {})
                    v["length"] = (dim.get("A", 0) or 0) + (dim.get("B", 0) or 0)

    except Exception as e:
        return {"error": str(e), "vessels_so_far": len(vessels)}

    # Analyze
    vessel_list = list(vessels.values())
    tankers = [v for v in vessel_list if v.get("ship_type") == "Tanker"]
    cargo = [v for v in vessel_list if v.get("ship_type") == "Cargo"]
    moving = [v for v in vessel_list if v.get("speed_knots", 0) > 1.0]
    stopped = [v for v in vessel_list if v.get("speed_knots", 0) <= 1.0]

    country_stats = {}
    for v in vessel_list:
        c = v.get("country", "Unknown") or "Unknown"
        country_stats[c] = country_stats.get(c, 0) + 1

    return {
        "scan_time": datetime.now(timezone.utc).isoformat(),
        "region": region_name,
        "region_desc": REGIONS.get(region_name, {}).get("desc", region_name),
        "collection_duration_sec": duration_sec,
        "total_vessels": len(vessel_list),
        "tankers": len(tankers),
        "cargo": len(cargo),
        "moving": len(moving),
        "stopped": len(stopped),
        "countries": dict(sorted(country_stats.items(), key=lambda x: -x[1])[:15]),
        "tanker_details": sorted(tankers, key=lambda x: -(x.get("length", 0)))[:10],
        "all_vessels": sorted(vessel_list, key=lambda x: -(x.get("speed_knots", 0)))[:20],
    }


def print_summary(data):
    if "error" in data:
        print(f"❌ Error: {data['error']}")
        return

    print(f"\n{'='*60}")
    print(f"🚢  AIS Scan: {data['region_desc']}")
    print(f"    Time: {data['scan_time']}")
    print(f"    Collection: {data['collection_duration_sec']}s")
    print(f"{'='*60}")
    print(f"  Total vessels: {data['total_vessels']}")
    print(f"  Tankers: {data['tankers']} | Cargo: {data['cargo']}")
    print(f"  Moving: {data['moving']} | Stopped: {data['stopped']}")

    if data['countries']:
        print(f"\n  Top flag states:")
        for c, n in list(data['countries'].items())[:8]:
            print(f"    {c}: {n}")

    if data['tanker_details']:
        print(f"\n  🛢️ Largest tankers:")
        for v in data['tanker_details'][:5]:
            name = v.get('name', 'Unknown')
            dest = v.get('destination', '?')
            speed = v.get('speed_knots', 0)
            length = v.get('length', 0)
            print(f"    {name} | {length}m | {speed:.1f}kn → {dest} | {v['lat']:.2f},{v['lon']:.2f}")

    moving_list = [v for v in data.get('all_vessels', []) if v.get('speed_knots', 0) > 1.0]
    if moving_list:
        print(f"\n  ⚡ Fastest vessels:")
        for v in moving_list[:5]:
            name = v.get('name', 'Unknown')
            stype = v.get('ship_type', '?')
            speed = v.get('speed_knots', 0)
            print(f"    {name} | {stype} | {speed:.1f} knots")


def main():
    parser = argparse.ArgumentParser(description="AIS Ship Scanner")
    parser.add_argument("--region", default="hormuz", help=f"Region: {', '.join(REGIONS.keys())}")
    parser.add_argument("--bbox", help="Custom bbox: lat_min,lon_min,lat_max,lon_max")
    parser.add_argument("--duration", type=int, default=60, help="Collection duration in seconds (default: 60)")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    args = parser.parse_args()

    bbox = None
    if args.bbox:
        parts = [float(x) for x in args.bbox.split(",")]
        bbox = [[parts[0], parts[1]], [parts[2], parts[3]]]
    elif args.region in REGIONS:
        bbox = REGIONS[args.region]["bbox"]
    else:
        print(f"Unknown region: {args.region}", file=sys.stderr)
        print(f"Available: {', '.join(REGIONS.keys())}", file=sys.stderr)
        sys.exit(1)

    result = asyncio.run(collect_ais(args.region, bbox, args.duration))

    if args.json:
        print(json.dumps(result, indent=2, default=str))
    else:
        print_summary(result)


if __name__ == "__main__":
    main()
