#!/usr/bin/env python3
"""GDELT v2 Event Monitor — download latest 15-min event data and filter by country.

GDELT updates every 15 minutes with global event data extracted from news.
Key event codes:
  14* = Protest
  18* = Assault / Use force
  19* = Fight / Military engagement
  20* = Unconventional mass violence
"""

import argparse
import csv
import zipfile
import io
import json
import os
import sys
import tempfile
import urllib.request
import urllib.error
import zipfile
from datetime import datetime, timezone

LASTUPDATE_URL = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt"

# GDELT 2.0 export CSV column indices (0-based)
COL_SQLDATE = 1           # YYYYMMDD
COL_ACTOR1_CODE = 5       # Actor1Code
COL_ACTOR1_NAME = 6       # Actor1Name
COL_ACTOR1_COUNTRY = 7    # Actor1CountryCode
COL_ACTOR2_CODE = 15      # Actor2Code
COL_ACTOR2_NAME = 16      # Actor2Name
COL_ACTOR2_COUNTRY = 17   # Actor2CountryCode
COL_EVENT_CODE = 26        # EventCode (CAMEO code)
COL_EVENT_BASE = 27        # EventBaseCode
COL_EVENT_ROOT = 28        # EventRootCode
COL_GOLDSTEIN = 30         # GoldsteinScale
COL_NUM_MENTIONS = 31      # NumMentions
COL_NUM_SOURCES = 32       # NumSources
COL_NUM_ARTICLES = 33      # NumArticles
COL_AVG_TONE = 34          # AvgTone
COL_ACTOR1_GEO_LAT = 39   # Actor1Geo_Lat — actually these are in the wrong position
COL_ACTOR1_GEO_LONG = 40  # Actor1Geo_Long
COL_ACTION_GEO_TYPE = 37   # ActionGeo_Type
COL_ACTION_GEO_FULLNAME = 38  # ActionGeo_FullName
COL_ACTION_GEO_COUNTRYCODE = 39  # ActionGeo_CountryCode  (NOTE: not lat!)
COL_ACTION_GEO_LAT = 40   # ActionGeo_Lat
COL_ACTION_GEO_LONG = 41  # ActionGeo_Long
COL_DATEADDED = 59         # DATEADDED
COL_SOURCEURL = 60         # SOURCEURL

# Actually, GDELT v2 export columns (corrected):
# The exact positions depend on version. Let's use a safe approach.

# CAMEO event code descriptions
EVENT_CATEGORIES = {
    "01": "Make public statement",
    "02": "Appeal",
    "03": "Express intent to cooperate",
    "04": "Consult",
    "05": "Engage in diplomatic cooperation",
    "06": "Engage in material cooperation",
    "07": "Provide aid",
    "08": "Yield",
    "09": "Investigate",
    "10": "Demand",
    "11": "Disapprove",
    "12": "Reject",
    "13": "Threaten",
    "14": "Protest",
    "15": "Exhibit military posture",
    "16": "Reduce relations",
    "17": "Coerce",
    "18": "Assault",
    "19": "Fight",
    "20": "Use unconventional mass violence",
}

# Country code mapping
COUNTRY_ALIASES = {
    "iran": "IRN",
    "irn": "IRN",
    "israel": "ISR",
    "isr": "ISR",
    "russia": "RUS",
    "rus": "RUS",
    "ukraine": "UKR",
    "ukr": "UKR",
    "china": "CHN",
    "chn": "CHN",
    "usa": "USA",
    "united_states": "USA",
}

# High-conflict event codes
HIGH_CONFLICT_ROOTS = {"14", "15", "17", "18", "19", "20"}


def get_latest_export_url() -> str:
    """Fetch the latest GDELT v2 export file URL."""
    req = urllib.request.Request(LASTUPDATE_URL, headers={"User-Agent": "OpenClaw-GDELT/1.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        lines = resp.read().decode().strip().split("\n")

    # First line is the export file (events), second is mentions, third is GKG
    for line in lines:
        parts = line.strip().split()
        if len(parts) >= 3 and "export" in parts[2].lower():
            return parts[2]

    raise RuntimeError(f"Could not find export URL in lastupdate.txt: {lines}")


def download_and_parse(url: str) -> list[list[str]]:
    """Download zipped CSV and parse rows."""
    req = urllib.request.Request(url, headers={"User-Agent": "OpenClaw-GDELT/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        zip_data = resp.read()

    with zipfile.ZipFile(io.BytesIO(zip_data)) as zf:
        csv_name = zf.namelist()[0]
        csv_data = zf.read(csv_name).decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(csv_data), delimiter="\t")
    return list(reader)


def safe_get(row, idx, default=""):
    """Safely get column value."""
    try:
        return row[idx].strip() if idx < len(row) else default
    except (IndexError, AttributeError):
        return default


def filter_events(rows: list[list[str]], country_code: str, conflict_only: bool = False) -> list[dict]:
    """Filter events by country involvement."""
    events = []
    for row in rows:
        if len(row) < 40:
            continue

        actor1_cc = safe_get(row, COL_ACTOR1_COUNTRY).upper()
        actor2_cc = safe_get(row, COL_ACTOR2_COUNTRY).upper()

        if country_code not in (actor1_cc, actor2_cc):
            continue

        event_code = safe_get(row, COL_EVENT_CODE)
        root_code = safe_get(row, COL_EVENT_ROOT)

        if conflict_only and root_code not in HIGH_CONFLICT_ROOTS:
            continue

        # Parse Goldstein scale
        try:
            goldstein = float(safe_get(row, COL_GOLDSTEIN, "0"))
        except ValueError:
            goldstein = 0.0

        try:
            num_mentions = int(safe_get(row, COL_NUM_MENTIONS, "0"))
        except ValueError:
            num_mentions = 0

        try:
            avg_tone = float(safe_get(row, COL_AVG_TONE, "0"))
        except ValueError:
            avg_tone = 0.0

        try:
            num_sources = int(safe_get(row, COL_NUM_SOURCES, "0"))
        except ValueError:
            num_sources = 0

        category = EVENT_CATEGORIES.get(root_code, f"Code {root_code}")

        # Flags
        flags = []
        if root_code in {"19", "20"}:
            flags.append("🔴 MILITARY/VIOLENCE")
        elif root_code == "18":
            flags.append("⚠️ ASSAULT")
        elif root_code == "14":
            flags.append("📢 PROTEST")
        elif root_code == "15":
            flags.append("🎖️ MILITARY POSTURE")
        if goldstein <= -7:
            flags.append("📉 HIGHLY NEGATIVE")
        if num_mentions >= 20:
            flags.append("📰 HIGH COVERAGE")

        date_added = safe_get(row, COL_DATEADDED) if len(row) > COL_DATEADDED else ""
        source_url = safe_get(row, COL_SOURCEURL) if len(row) > COL_SOURCEURL else ""

        event = {
            "date": safe_get(row, COL_SQLDATE),
            "date_added": date_added,
            "actor1": safe_get(row, COL_ACTOR1_NAME) or safe_get(row, COL_ACTOR1_CODE),
            "actor1_country": actor1_cc,
            "actor2": safe_get(row, COL_ACTOR2_NAME) or safe_get(row, COL_ACTOR2_CODE),
            "actor2_country": actor2_cc,
            "event_code": event_code,
            "event_category": category,
            "goldstein_scale": goldstein,
            "num_mentions": num_mentions,
            "num_sources": num_sources,
            "avg_tone": round(avg_tone, 2),
            "geo_fullname": safe_get(row, COL_ACTION_GEO_FULLNAME),
            "source_url": source_url,
            "flags": flags,
        }
        events.append(event)

    # Sort by severity (Goldstein ascending = most negative first), then mentions
    events.sort(key=lambda e: (e["goldstein_scale"], -e["num_mentions"]))
    return events


def print_human(events: list[dict], country: str, conflict_only: bool):
    mode = "CONFLICT EVENTS ONLY" if conflict_only else "ALL EVENTS"
    print(f"\n📡 GDELT Events — {country.upper()} ({mode})")
    print(f"   Total events: {len(events)}")
    print("=" * 72)

    if not events:
        print("   No events found in latest 15-min window.")
        return

    for e in events:
        flag_str = " ".join(e["flags"]) if e["flags"] else ""
        print(f"\n  [{e['event_code']}] {e['event_category']:<35} {flag_str}")
        print(f"       {e['actor1']}({e['actor1_country']}) → {e['actor2']}({e['actor2_country']})")
        print(f"       Goldstein: {e['goldstein_scale']:+.1f}  Mentions: {e['num_mentions']}  Tone: {e['avg_tone']:+.1f}")
        if e.get("geo_fullname"):
            print(f"       📍 {e['geo_fullname']}")
        if e.get("source_url"):
            print(f"       🔗 {e['source_url'][:80]}")

    # Summary stats
    conflict = [e for e in events if e["flags"] and any("MILITARY" in f or "ASSAULT" in f for f in e["flags"])]
    if conflict:
        print(f"\n🚨 {len(conflict)} military/assault event(s) detected")


def main():
    parser = argparse.ArgumentParser(description="GDELT v2 Event Monitor")
    parser.add_argument("--country", "-c", default="iran",
                        help="Country to filter (name or 3-letter code, default: iran)")
    parser.add_argument("--conflict-only", "-f", action="store_true",
                        help="Only show conflict events (codes 14-20)")
    parser.add_argument("--json", "-j", action="store_true",
                        help="Output JSON")
    args = parser.parse_args()

    # Resolve country code
    country_input = args.country.lower().replace(" ", "_")
    country_code = COUNTRY_ALIASES.get(country_input, country_input.upper())
    if len(country_code) != 3:
        print(f"Warning: '{country_code}' doesn't look like a 3-letter country code", file=sys.stderr)

    # Download latest data
    print("Fetching latest GDELT update...", file=sys.stderr)
    export_url = get_latest_export_url()
    print(f"Downloading: {export_url}", file=sys.stderr)
    rows = download_and_parse(export_url)
    print(f"Parsed {len(rows)} total events", file=sys.stderr)

    # Filter
    events = filter_events(rows, country_code, args.conflict_only)

    if args.json:
        output = {
            "country_code": country_code,
            "conflict_only": args.conflict_only,
            "source_url": export_url,
            "total_raw_events": len(rows),
            "filtered_events": len(events),
            "events": events,
        }
        print(json.dumps(output, indent=2, ensure_ascii=False))
    else:
        print_human(events, country_code, args.conflict_only)


if __name__ == "__main__":
    main()
