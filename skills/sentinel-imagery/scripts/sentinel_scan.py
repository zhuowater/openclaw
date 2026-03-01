#!/usr/bin/env python3
"""
Sentinel-2 Satellite Imagery Scanner
Queries Copernicus Data Space OData API for recent Sentinel-2 imagery
over specified coordinates. Free catalogue search, no API key required.
"""
import json, sys, subprocess, os, argparse
from datetime import datetime, timezone, timedelta

BASE_URL = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"
DOWNLOAD_BASE = "https://zipper.dataspace.copernicus.eu/odata/v1/Products"
BROWSER_BASE = "https://browser.dataspace.copernicus.eu"
PROXY = os.environ.get("SOCKS_PROXY", "")

# Preset locations: Iranian nuclear/military sites + major cities
LOCATIONS = {
    "natanz":       {"lon": 51.727, "lat": 33.721, "desc": "Natanz uranium enrichment facility"},
    "fordow":       {"lon": 51.567, "lat": 34.880, "desc": "Fordow underground enrichment facility"},
    "bushehr":      {"lon": 50.886, "lat": 28.831, "desc": "Bushehr nuclear power plant"},
    "isfahan":      {"lon": 51.677, "lat": 32.652, "desc": "Isfahan nuclear technology center"},
    "tehran":       {"lon": 51.42,  "lat": 35.69,  "desc": "Tehran (capital)"},
    "bandar_abbas": {"lon": 56.27,  "lat": 27.18,  "desc": "Bandar Abbas naval base"},
    "parchin":      {"lon": 51.77,  "lat": 35.52,  "desc": "Parchin military complex"},
    "arak":         {"lon": 49.28,  "lat": 34.09,  "desc": "Arak heavy water reactor"},
}


def curl_fetch(url):
    """Fetch URL via curl with optional proxy."""
    cmd = ["curl", "-s", "--max-time", "30", "--globoff"]
    if PROXY:
        cmd.extend(["-x", PROXY])
    cmd.append(url)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=35)
    if result.returncode != 0:
        raise RuntimeError(f"curl failed: {result.stderr}")
    return result.stdout


def search_imagery(lon, lat, days_back=30, max_results=10, collection="SENTINEL-2",
                   max_cloud=None, level="L2A"):
    """Search for Sentinel-2 imagery at a given point."""
    start_date = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%dT00:00:00.000Z")

    # Build OData filter
    filters = [
        f"Collection/Name eq '{collection}'",
        f"OData.CSC.Intersects(area=geography'SRID=4326;POINT({lon} {lat})')",
        f"ContentDate/Start gt {start_date}",
    ]
    if max_cloud is not None:
        filters.append(f"Attributes/OData.CSC.DoubleAttribute/any(att:att/Name eq 'cloudCover' and att/OData.CSC.DoubleAttribute/Value lt {max_cloud})")
    if level:
        # Filter by processing level (L1C or L2A)
        filters.append(f"contains(Name,'{level}')")

    filter_str = " and ".join(filters)
    import urllib.parse
    encoded_filter = urllib.parse.quote(filter_str, safe="")
    url = (f"{BASE_URL}?%24filter={encoded_filter}"
           f"&%24top={max_results}"
           f"&%24orderby={urllib.parse.quote('ContentDate/Start desc')}")

    raw = curl_fetch(url)
    if not raw.strip():
        return {"error": "Empty response from Copernicus API"}

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {"error": f"Invalid JSON response: {raw[:200]}"}

    if "error" in data:
        return {"error": data["error"].get("message", str(data["error"]))}

    products = []
    for item in data.get("value", []):
        product_id = item.get("Id", "")
        name = item.get("Name", "")
        content_date = item.get("ContentDate", {})
        start = content_date.get("Start", "")
        size_bytes = item.get("ContentLength", 0)
        online = item.get("Online", False)

        # Extract cloud cover from attributes if available in name
        # Name format: S2B_MSIL2A_20260225T...
        cloud_cover = None
        # We need to query attributes separately or parse from extended metadata
        # For now, use the Attributes endpoint
        footprint = item.get("GeoFootprint", {})

        products.append({
            "id": product_id,
            "name": name,
            "date": start[:10] if start else "",
            "datetime": start,
            "size_mb": round(size_bytes / 1024 / 1024, 1),
            "online": online,
            "download_url": f"{DOWNLOAD_BASE}({product_id})/$value",
            "browser_url": f"{BROWSER_BASE}/#lat={lat}&lng={lon}&zoom=14",
            "footprint": footprint,
        })

    return products


def query_cloud_cover(product_ids):
    """Query cloud cover for products via Attributes expansion."""
    if not product_ids:
        return {}

    results = {}
    for pid in product_ids[:5]:  # Limit to avoid too many requests
        url = f"{BASE_URL}({pid})/Attributes"
        try:
            raw = curl_fetch(url)
            attrs = json.loads(raw)
            for attr in attrs.get("value", []):
                if attr.get("Name") == "cloudCover":
                    results[pid] = attr.get("Value")
                    break
        except Exception:
            pass
    return results


def main():
    parser = argparse.ArgumentParser(description="Sentinel-2 Satellite Imagery Scanner")
    parser.add_argument("--location", "-l", help=f"Preset location: {', '.join(LOCATIONS.keys())}")
    parser.add_argument("--lat", type=float, help="Latitude")
    parser.add_argument("--lon", type=float, help="Longitude")
    parser.add_argument("--days", type=int, default=30, help="Days to look back (default: 30)")
    parser.add_argument("--max-results", "-n", type=int, default=10, help="Max results (default: 10)")
    parser.add_argument("--max-cloud", type=float, help="Max cloud cover %% (e.g. 20)")
    parser.add_argument("--level", default="L2A", choices=["L1C", "L2A", ""], help="Processing level (default: L2A)")
    parser.add_argument("--all-locations", action="store_true", help="Scan all preset locations")
    parser.add_argument("--cloud-detail", action="store_true", help="Fetch cloud cover for each product (slower)")
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
                products = search_imagery(
                    info["lon"], info["lat"],
                    days_back=args.days,
                    max_results=3,  # Fewer per location in bulk mode
                    max_cloud=args.max_cloud,
                    level=args.level,
                )
                all_results[name] = {
                    "location": info,
                    "products": products if isinstance(products, list) else [],
                    "error": products.get("error") if isinstance(products, dict) else None,
                    "count": len(products) if isinstance(products, list) else 0,
                }
            except Exception as e:
                all_results[name] = {"error": str(e)}

        if args.json:
            print(json.dumps(all_results, indent=2))
        else:
            print_all_summary(all_results)
        return

    # Single location mode
    if args.location:
        if args.location not in LOCATIONS:
            print(f"Unknown location: {args.location}", file=sys.stderr)
            print(f"Available: {', '.join(LOCATIONS.keys())}", file=sys.stderr)
            sys.exit(1)
        loc = LOCATIONS[args.location]
        lon, lat = loc["lon"], loc["lat"]
        loc_name = args.location
    elif args.lat is not None and args.lon is not None:
        lon, lat = args.lon, args.lat
        loc_name = f"custom ({lat:.3f}, {lon:.3f})"
    else:
        parser.print_help()
        sys.exit(1)

    try:
        products = search_imagery(
            lon, lat,
            days_back=args.days,
            max_results=args.max_results,
            max_cloud=args.max_cloud,
            level=args.level,
        )
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

    if isinstance(products, dict) and "error" in products:
        print(f"❌ Error: {products['error']}", file=sys.stderr)
        sys.exit(1)

    # Optionally fetch cloud cover
    cloud_data = {}
    if args.cloud_detail and products:
        cloud_data = query_cloud_cover([p["id"] for p in products])
        for p in products:
            if p["id"] in cloud_data:
                p["cloud_cover_pct"] = cloud_data[p["id"]]

    if args.json:
        output = {
            "scan_time": datetime.now(timezone.utc).isoformat(),
            "location": loc_name,
            "coordinates": {"lon": lon, "lat": lat},
            "days_back": args.days,
            "total_found": len(products),
            "products": products,
        }
        print(json.dumps(output, indent=2))
    else:
        print_summary(loc_name, lon, lat, products, args.days, cloud_data)


def print_summary(loc_name, lon, lat, products, days, cloud_data=None):
    print(f"\n{'='*65}")
    print(f"🛰️  Sentinel-2 Imagery: {loc_name}")
    print(f"    Coordinates: ({lat:.3f}, {lon:.3f})")
    print(f"    Period: last {days} days | Found: {len(products)} images")
    print(f"{'='*65}")

    if not products:
        print("  No imagery found for this period/location.")
        return

    for i, p in enumerate(products, 1):
        cloud_str = ""
        if "cloud_cover_pct" in p:
            cc = p["cloud_cover_pct"]
            cloud_str = f" | ☁️ {cc:.1f}%"
        size_str = f"{p['size_mb']:.0f}MB" if p['size_mb'] else "?"

        print(f"\n  [{i}] {p['date']}  {size_str}{cloud_str}")
        print(f"      {p['name']}")
        print(f"      ID: {p['id']}")
        online = "✅ online" if p["online"] else "⏳ offline"
        print(f"      Status: {online}")
        print(f"      Download: {p['download_url']}")

    print(f"\n  🌐 Browse: {BROWSER_BASE}/#lat={lat}&lng={lon}&zoom=14")
    print(f"\n  💡 Intel tip: Compare pre/post-strike imagery for BDA")


def print_all_summary(all_results):
    print(f"\n{'='*65}")
    print(f"🛰️  Sentinel-2 Bulk Scan — {len(all_results)} locations")
    print(f"    Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"{'='*65}")

    for name, data in all_results.items():
        if data.get("error"):
            print(f"\n  ❌ {name}: {data['error']}")
            continue

        loc = data.get("location", {})
        products = data.get("products", [])
        latest = products[0]["date"] if products else "none"
        print(f"\n  📍 {name:15s} | {data['count']} images | latest: {latest}")
        print(f"     {loc.get('desc', '')}")
        if products:
            for p in products[:2]:
                print(f"     - {p['date']}  {p['size_mb']:.0f}MB  {p['name'][:60]}")


if __name__ == "__main__":
    main()
