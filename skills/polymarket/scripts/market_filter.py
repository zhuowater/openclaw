#!/usr/bin/env python3
"""
Polymarket Market Filter — replaces fragile jq piping with proper Python filtering.

Usage:
  python3 market_filter.py "ceasefire|peace|crude|oil" [--field question] [--min-vol 10000] [--limit 50]
  python3 market_filter.py "iran|israel" --fields question,description --format brief
  python3 market_filter.py "\\$100|\\$150|crude|brent|wti" --min-vol 5000

The regex is Python re (case-insensitive). Dollar signs work natively — no jq escaping issues.

Options:
  --field / --fields   Comma-separated fields to search (default: question)
  --min-vol            Minimum 24h volume in USD (default: 0)
  --limit              Max markets to fetch from API (default: 100)
  --format             Output format: full (default) | brief | json
  --active-only        Only show active, non-closed markets (default: true)
  --proxy              SOCKS5 proxy (default: socks5h://127.0.0.1:7880)

Created by Evolver Cycle #0031 to fix recurring jq escape errors with $ in regex patterns.
"""
import re, json, sys, os, argparse, subprocess


GAMMA_HOST = "https://gamma-api.polymarket.com"

def curl_json(url, proxy):
    """Fetch JSON via curl with proxy support."""
    result = subprocess.run(
        ["curl", "-s", "-x", proxy, url],
        capture_output=True, text=True, timeout=20
    )
    if result.returncode != 0:
        print(f"Error: curl failed with code {result.returncode}", file=sys.stderr)
        sys.exit(1)
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        print(f"Error: Invalid JSON from API", file=sys.stderr)
        sys.exit(1)


def filter_markets(markets, pattern, fields, min_vol):
    """Filter markets using Python regex — handles $, |, and all special chars properly."""
    try:
        rx = re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        print(f"Error: Invalid regex pattern: {e}", file=sys.stderr)
        sys.exit(1)

    results = []
    for m in markets:
        # Check volume threshold
        vol24h = 0
        try:
            vol24h = float(m.get("volume24hr", 0) or 0)
        except (ValueError, TypeError):
            pass
        if vol24h < min_vol:
            continue

        # Search specified fields
        matched = False
        for field in fields:
            val = str(m.get(field, ""))
            if rx.search(val):
                matched = True
                break
        if not matched:
            continue

        # Extract prices
        prices = []
        try:
            prices = json.loads(m.get("outcomePrices", "[]"))
        except (json.JSONDecodeError, TypeError):
            pass

        outcomes = []
        try:
            outcomes = json.loads(m.get("outcomes", "[]"))
        except (json.JSONDecodeError, TypeError):
            if isinstance(m.get("outcomes"), list):
                outcomes = m["outcomes"]

        results.append({
            "question": m.get("question", ""),
            "slug": m.get("slug", ""),
            "yes_price": float(prices[0]) if len(prices) > 0 else None,
            "no_price": float(prices[1]) if len(prices) > 1 else None,
            "outcomes": outcomes,
            "volume_24h": vol24h,
            "volume_total": float(m.get("volumeNum", 0) or 0),
            "liquidity": float(m.get("liquidity", 0) or 0),
            "end_date": m.get("endDate", ""),
        })

    # Sort by 24h volume descending
    results.sort(key=lambda x: x["volume_24h"], reverse=True)
    return results


def format_brief(results):
    """Human-readable brief output."""
    if not results:
        print("No markets matched the filter.")
        return
    print(f"Found {len(results)} matching markets:\n")
    for r in results:
        yes = f"{r['yes_price']:.1%}" if r['yes_price'] is not None else "N/A"
        vol = f"${r['volume_24h']/1000:.0f}k" if r['volume_24h'] >= 1000 else f"${r['volume_24h']:.0f}"
        print(f"  {r['question']}")
        print(f"    YES: {yes} | Vol24h: {vol} | Slug: {r['slug']}")
        print()


def main():
    parser = argparse.ArgumentParser(
        description="Filter Polymarket markets by regex (replaces fragile jq piping)")
    parser.add_argument("pattern", help="Python regex pattern (case-insensitive)")
    parser.add_argument("--field", "--fields", dest="fields", default="question",
                        help="Comma-separated fields to search (default: question)")
    parser.add_argument("--min-vol", type=float, default=0,
                        help="Minimum 24h volume in USD (default: 0)")
    parser.add_argument("--limit", type=int, default=100,
                        help="Max markets to fetch from Gamma API (default: 100)")
    parser.add_argument("--format", choices=["full", "brief", "json"], default="brief",
                        help="Output format (default: brief)")
    parser.add_argument("--include-closed", action="store_true",
                        help="Include closed markets")
    parser.add_argument("--proxy", default="socks5h://127.0.0.1:7880",
                        help="SOCKS5 proxy")
    args = parser.parse_args()

    fields = [f.strip() for f in args.fields.split(",")]

    # Build API URL
    url = (f"{GAMMA_HOST}/markets?_limit={args.limit}"
           f"&order=volume24hr&ascending=false")
    if not args.include_closed:
        url += "&active=true&closed=false"

    markets = curl_json(url, args.proxy)
    if not isinstance(markets, list):
        print(f"Error: API returned unexpected type: {type(markets)}", file=sys.stderr)
        sys.exit(1)

    results = filter_markets(markets, args.pattern, fields, args.min_vol)

    if args.format == "json":
        print(json.dumps(results, indent=2, ensure_ascii=False))
    elif args.format == "full":
        print(json.dumps(results, indent=2, ensure_ascii=False))
    else:
        format_brief(results)


if __name__ == "__main__":
    main()
