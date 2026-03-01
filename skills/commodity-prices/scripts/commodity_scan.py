#!/usr/bin/env python3
"""Commodity Price Monitor — track war-sensitive financial indicators.

Intelligence value:
  - Oil price spike → sanctions/blockade effectiveness
  - VIX spike → market panic / conflict escalation
  - Gold/Silver rise → safe-haven flight
"""

import argparse
import json
import re
import subprocess
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

# Symbols to track
SYMBOLS = {
    "CL=F":  {"name": "WTI Crude Oil", "unit": "USD/bbl", "category": "energy"},
    "BZ=F":  {"name": "Brent Crude Oil", "unit": "USD/bbl", "category": "energy"},
    "GC=F":  {"name": "Gold", "unit": "USD/oz", "category": "precious_metal"},
    "SI=F":  {"name": "Silver", "unit": "USD/oz", "category": "precious_metal"},
    "^VIX":  {"name": "VIX (Fear Index)", "unit": "index", "category": "volatility"},
}

PROXY = "socks5h://127.0.0.1:7880"

# War-related thresholds
ALERT_THRESHOLDS = {
    "CL=F":  {"spike_pct": 5, "high_price": 100, "label": "Oil above $100 = major disruption"},
    "BZ=F":  {"spike_pct": 5, "high_price": 105, "label": "Brent above $105 = supply crisis"},
    "GC=F":  {"spike_pct": 3, "high_price": 2500, "label": "Gold surge = safe-haven demand"},
    "SI=F":  {"spike_pct": 5, "high_price": 35, "label": "Silver surge = industrial + safe-haven"},
    "^VIX":  {"spike_pct": 20, "high_price": 30, "label": "VIX > 30 = extreme fear"},
}


def fetch_yahoo_v8(symbol: str, use_proxy: bool = False) -> dict | None:
    """Try Yahoo Finance v8 chart API."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=5d"
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    }

    try:
        if use_proxy:
            # Use curl with proxy
            cmd = [
                "curl", "-sL", "--max-time", "15",
                "-x", PROXY,
                "-H", f"User-Agent: {headers['User-Agent']}",
                url
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
            if result.returncode != 0:
                return None
            return json.loads(result.stdout)
        else:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode())
    except Exception:
        return None


def parse_yahoo_v8(data: dict, symbol: str) -> dict | None:
    """Parse Yahoo v8 chart response."""
    try:
        result = data["chart"]["result"][0]
        meta = result["meta"]
        price = meta.get("regularMarketPrice", 0)
        prev_close = meta.get("chartPreviousClose") or meta.get("previousClose", 0)

        if price and prev_close and prev_close > 0:
            change = price - prev_close
            change_pct = (change / prev_close) * 100
        else:
            change = 0
            change_pct = 0

        return {
            "price": round(price, 2),
            "previous_close": round(prev_close, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
            "currency": meta.get("currency", "USD"),
            "exchange": meta.get("exchangeName", ""),
            "market_state": meta.get("marketState", ""),
        }
    except (KeyError, IndexError, TypeError):
        return None


def fetch_via_curl_scrape(symbol: str) -> dict | None:
    """Fallback: scrape Yahoo Finance quote page via proxy."""
    url = f"https://finance.yahoo.com/quote/{symbol}/"
    try:
        cmd = [
            "curl", "-sL", "--max-time", "15",
            "-x", PROXY,
            "-H", "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
            url
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        if result.returncode != 0:
            return None

        html = result.stdout
        # Try to extract price from various patterns
        # Pattern: "regularMarketPrice":{"raw":72.15
        match = re.search(r'"regularMarketPrice":\{"raw":([\d.]+)', html)
        if match:
            price = float(match.group(1))
            # Try to get change
            change_match = re.search(r'"regularMarketChange":\{"raw":([-\d.]+)', html)
            pct_match = re.search(r'"regularMarketChangePercent":\{"raw":([-\d.]+)', html)
            return {
                "price": round(price, 2),
                "change": round(float(change_match.group(1)), 2) if change_match else 0,
                "change_pct": round(float(pct_match.group(1)), 2) if pct_match else 0,
            }
    except Exception:
        pass
    return None


def fetch_price(symbol: str) -> dict | None:
    """Try multiple methods to get price data."""
    info = SYMBOLS.get(symbol, {"name": symbol, "unit": "?", "category": "?"})

    # Method 1: Yahoo v8 API direct
    data = fetch_yahoo_v8(symbol, use_proxy=False)
    if data:
        parsed = parse_yahoo_v8(data, symbol)
        if parsed:
            parsed["method"] = "yahoo_v8_direct"
            return parsed

    # Method 2: Yahoo v8 API via proxy
    data = fetch_yahoo_v8(symbol, use_proxy=True)
    if data:
        parsed = parse_yahoo_v8(data, symbol)
        if parsed:
            parsed["method"] = "yahoo_v8_proxy"
            return parsed

    # Method 3: Scrape via proxy
    parsed = fetch_via_curl_scrape(symbol)
    if parsed:
        parsed["method"] = "yahoo_scrape_proxy"
        return parsed

    return None


def get_all_prices() -> dict:
    """Fetch all commodity prices."""
    results = {}
    for symbol in SYMBOLS:
        price_data = fetch_price(symbol)
        info = SYMBOLS[symbol]
        if price_data:
            results[symbol] = {
                **info,
                **price_data,
                "flags": generate_flags(symbol, price_data),
            }
        else:
            results[symbol] = {
                **info,
                "price": None,
                "error": "Failed to fetch",
                "flags": [],
            }
    return results


def generate_flags(symbol: str, data: dict) -> list[str]:
    """Generate intelligence flags."""
    flags = []
    thresholds = ALERT_THRESHOLDS.get(symbol, {})
    price = data.get("price", 0) or 0
    change_pct = data.get("change_pct", 0) or 0

    if thresholds.get("spike_pct") and abs(change_pct) >= thresholds["spike_pct"]:
        direction = "📈 SPIKE" if change_pct > 0 else "📉 CRASH"
        flags.append(f"{direction} ({change_pct:+.1f}%)")

    if thresholds.get("high_price") and price >= thresholds["high_price"]:
        flags.append(f"🔴 {thresholds.get('label', 'HIGH')}")

    return flags


def print_human(results: dict):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print(f"\n💰 Commodity Prices — {now}")
    print("=" * 65)

    for symbol, data in results.items():
        if data.get("price") is None:
            print(f"\n  {data['name']:<25} ❌ {data.get('error', 'unavailable')}")
            continue

        change_str = f"{data.get('change', 0):+.2f} ({data.get('change_pct', 0):+.2f}%)"
        arrow = "🟢" if data.get("change_pct", 0) >= 0 else "🔴"
        flag_str = " ".join(data.get("flags", []))

        print(f"\n  {data['name']:<25} {arrow} ${data['price']:.2f} {data['unit']}")
        print(f"  {'':25} Change: {change_str}  {flag_str}")
        if data.get("market_state"):
            print(f"  {'':25} Market: {data['market_state']}")

    # War indicator summary
    print("\n" + "-" * 65)
    print("📊 War Indicator Summary:")
    oil = results.get("CL=F", {})
    vix = results.get("^VIX", {})
    gold = results.get("GC=F", {})

    if oil.get("price"):
        if oil["price"] > 90:
            print("  ⚠️  Oil elevated — supply disruption or sanctions pressure")
        if oil.get("change_pct", 0) > 3:
            print("  🚨 Oil spiking — possible escalation event")
    if vix.get("price"):
        if vix["price"] > 25:
            print("  ⚠️  VIX elevated — market uncertainty")
        if vix["price"] > 35:
            print("  🚨 VIX extreme — market panic")
    if gold.get("price") and gold.get("change_pct", 0) > 2:
        print("  ⚠️  Gold surging — safe-haven demand")


def main():
    parser = argparse.ArgumentParser(description="Commodity Price Monitor")
    parser.add_argument("--json", "-j", action="store_true", help="Output JSON")
    parser.add_argument("--symbols", "-s", nargs="+",
                        help=f"Specific symbols (default: all). Available: {', '.join(SYMBOLS)}")
    args = parser.parse_args()

    results = get_all_prices()

    if args.symbols:
        results = {k: v for k, v in results.items() if k in args.symbols}

    if args.json:
        output = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "commodities": results,
        }
        print(json.dumps(output, indent=2, ensure_ascii=False))
    else:
        print_human(results)


if __name__ == "__main__":
    main()
