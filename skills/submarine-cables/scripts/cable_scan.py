#!/usr/bin/env python3
"""Submarine Cable Monitor — track undersea cables in conflict regions.

Intelligence value:
  - Cable cuts = persistent internet blackout (vs government firewall)
  - Distinguishes physical damage from policy-based shutdowns
  - Persian Gulf cables are critical for Iran, Iraq, Kuwait connectivity

Data source: TeleGeography Submarine Cable Map API
"""

import argparse
import json
import sys
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_URL = "https://www.submarinecablemap.com/api/v3"
CABLE_LIST_URL = f"{BASE_URL}/cable/all.json"

# Regions and their associated countries (landing point country names)
REGIONS = {
    "iran": {
        "countries": {"Iran"},
        "description": "Cables with landing points in Iran",
    },
    "persian_gulf": {
        "countries": {"Iran", "Iraq", "Kuwait", "Bahrain", "Qatar", "United Arab Emirates", "Saudi Arabia", "Oman"},
        "description": "All cables in the Persian Gulf region",
    },
    "red_sea": {
        "countries": {"Egypt", "Saudi Arabia", "Yemen", "Djibouti", "Eritrea", "Sudan", "Jordan", "Israel"},
        "description": "Red Sea corridor cables",
    },
    "middle_east": {
        "countries": {"Iran", "Iraq", "Kuwait", "Bahrain", "Qatar", "United Arab Emirates", "Saudi Arabia",
                      "Oman", "Yemen", "Israel", "Lebanon", "Syria", "Jordan", "Egypt", "Turkey"},
        "description": "All Middle East cables",
    },
    "east_asia": {
        "countries": {"China", "Taiwan", "Japan", "South Korea"},
        "description": "East Asian corridor cables",
    },
}

# Known Iran-relevant cables (for fast lookup if API is slow)
KNOWN_IRAN_CABLES = [
    "falcon",
    "fiber-optic-gulf-fog",
    "fibre-in-gulf-fig",
    "gulf-bridge-international-cable-systemmiddle-east-north-africa-cable-system-gbicsmena",
    "imewe",
    "kuwait-iran",
    "pishgaman-oman-iran-poi-network",
    "tata-tgn-gulf",
    "uae-iran",
    "europe-india-gateway-eig",
    "asia-africa-europe-1-aae-1",
    "omranepeg",
]


def fetch_json(url: str) -> dict | list | None:
    """Fetch JSON from URL."""
    req = urllib.request.Request(url, headers={"User-Agent": "OpenClaw-CableMonitor/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"  ⚠ Failed to fetch {url}: {e}", file=sys.stderr)
        return None


def get_all_cables() -> list[dict]:
    """Get list of all cables (id + name only)."""
    return fetch_json(CABLE_LIST_URL) or []


def get_cable_detail(cable_id: str) -> dict | None:
    """Get detailed info for a single cable."""
    url = f"{BASE_URL}/cable/{cable_id}.json"
    return fetch_json(url)


def find_region_cables(region: str, max_workers: int = 10) -> list[dict]:
    """Find cables with landing points in region countries."""
    region_def = REGIONS.get(region)
    if not region_def:
        raise ValueError(f"Unknown region: {region}. Available: {', '.join(REGIONS)}")

    target_countries = region_def["countries"]

    # Decide which cables to check
    all_cables = get_all_cables()
    if not all_cables:
        print("Failed to fetch cable list, using known cables", file=sys.stderr)
        cable_ids = KNOWN_IRAN_CABLES
    else:
        # For iran/small regions, we can't filter from the list (no country info)
        # Use known list + broader search
        if region == "iran":
            cable_ids = list(set(KNOWN_IRAN_CABLES + [c["id"] for c in all_cables
                                                       if any(kw in c.get("name", "").lower()
                                                              for kw in ["iran", "gulf", "persian", "fog", "fig",
                                                                         "falcon", "imewe", "tgn-gulf", "kuwait",
                                                                         "uae-iran", "poi", "omran", "epeg",
                                                                         "eig", "aae"])]))
        elif region in ("persian_gulf", "middle_east", "red_sea"):
            # Need to check many cables — use known keywords
            keywords = ["gulf", "persian", "iran", "iraq", "kuwait", "bahrain", "qatar",
                         "uae", "emirates", "oman", "saudi", "yemen", "red sea", "egypt",
                         "israel", "lebanon", "syria", "jordan", "turkey", "falcon",
                         "imewe", "fog", "fig", "aae", "eig", "seacom", "teams",
                         "mena", "tgn", "peace", "seamewe", "airraq"]
            cable_ids = list(set(
                KNOWN_IRAN_CABLES +
                [c["id"] for c in all_cables
                 if any(kw in c.get("name", "").lower() or kw in c.get("id", "")
                        for kw in keywords)]
            ))
        else:
            # For other regions, check all cables (slow but thorough)
            cable_ids = [c["id"] for c in all_cables]

    print(f"Checking {len(cable_ids)} candidate cables...", file=sys.stderr)

    matching_cables = []

    def check_cable(cable_id):
        detail = get_cable_detail(cable_id)
        if not detail:
            return None

        landing_points = detail.get("landing_points", [])
        landing_countries = {lp.get("country", "") for lp in landing_points}

        if landing_countries & target_countries:
            return {
                "id": detail.get("id"),
                "name": detail.get("name"),
                "length": detail.get("length", "unknown"),
                "rfs": detail.get("rfs", "unknown"),  # Ready For Service date
                "owners": detail.get("owners", "unknown"),
                "url": detail.get("url", ""),
                "landing_points": landing_points,
                "landing_countries": sorted(landing_countries),
                "region_landing_points": [
                    lp for lp in landing_points
                    if lp.get("country") in target_countries
                ],
            }
        return None

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(check_cable, cid): cid for cid in cable_ids}
        for future in as_completed(futures):
            result = future.result()
            if result:
                matching_cables.append(result)

    matching_cables.sort(key=lambda c: c.get("name", ""))
    return matching_cables


def print_human(cables: list[dict], region: str):
    region_def = REGIONS.get(region, {})
    print(f"\n🌊 Submarine Cables — {region.upper()}")
    print(f"   {region_def.get('description', '')}")
    print(f"   Total cables found: {len(cables)}")
    print("=" * 72)

    if not cables:
        print("   No cables found for this region.")
        return

    for c in cables:
        print(f"\n  📡 {c['name']}")
        print(f"     ID: {c['id']}")
        if c.get("length") and c["length"] != "unknown":
            print(f"     Length: {c['length']}")
        if c.get("rfs") and c["rfs"] != "unknown":
            print(f"     Ready For Service: {c['rfs']}")
        if c.get("owners") and c["owners"] != "unknown":
            owners_str = c["owners"] if isinstance(c["owners"], str) else ", ".join(
                o.get("name", str(o)) if isinstance(o, dict) else str(o)
                for o in c["owners"]
            )
            print(f"     Owners: {owners_str}")

        # Show region-specific landing points
        region_lps = c.get("region_landing_points", [])
        if region_lps:
            lp_str = ", ".join(f"{lp.get('name', '?')} ({lp.get('country', '?')})" for lp in region_lps)
            print(f"     🏖️ Regional landing points: {lp_str}")

        # Show all countries
        countries = c.get("landing_countries", [])
        if countries:
            print(f"     🌍 Countries: {', '.join(countries)}")

    # Intelligence summary
    print(f"\n{'=' * 72}")
    print("📊 Intelligence Summary:")
    print(f"   {len(cables)} cable(s) serve this region")

    # Find single-country cables (most vulnerable)
    for c in cables:
        region_lps = c.get("region_landing_points", [])
        if len(region_lps) == 1:
            print(f"   ⚠️  {c['name']} has only 1 landing point in region — vulnerable to single-point failure")


def main():
    parser = argparse.ArgumentParser(description="Submarine Cable Monitor")
    parser.add_argument("--region", "-r", default="iran",
                        help=f"Region to scan: {', '.join(REGIONS)} (default: iran)")
    parser.add_argument("--json", "-j", action="store_true",
                        help="Output JSON")
    parser.add_argument("--list-all", "-l", action="store_true",
                        help="List all known cables (no region filter)")
    args = parser.parse_args()

    if args.list_all:
        cables = get_all_cables()
        if args.json:
            print(json.dumps(cables, indent=2, ensure_ascii=False))
        else:
            print(f"Total cables worldwide: {len(cables)}")
            for c in cables:
                print(f"  {c['id']}: {c['name']}")
        return

    cables = find_region_cables(args.region)

    if args.json:
        output = {
            "region": args.region,
            "description": REGIONS.get(args.region, {}).get("description", ""),
            "total_cables": len(cables),
            "cables": cables,
        }
        print(json.dumps(output, indent=2, ensure_ascii=False))
    else:
        print_human(cables, args.region)


if __name__ == "__main__":
    main()
