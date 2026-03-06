#!/usr/bin/env python3
"""
Get market info by token ID or slug from Polymarket Gamma API.

Usage:
  python3 market_info.py <token_id_or_slug> [--proxy socks5h://...]
  python3 market_info.py "48825140812430..." --proxy socks5h://127.0.0.1:7880

Output: JSON with question, tokens, prices, volumes, etc.

This is a lightweight wrapper that reuses trade.py's Gamma API logic.
Created to prevent recurring 'file not found' errors from automated sessions.
"""

import os, sys, json, argparse
import requests

GAMMA_HOST = "https://gamma-api.polymarket.com"
DATA_HOST = "https://data-api.polymarket.com"
CLOB_HOST = "https://clob.polymarket.com"

def get_proxy(proxy_arg=None):
    proxy = proxy_arg or os.environ.get("SOCKS5_PROXY", "socks5h://127.0.0.1:7880")
    return {"https": proxy, "http": proxy}

def get_market_by_token(token_id, proxies):
    """Get market info by CLOB token ID via Gamma API."""
    try:
        r = requests.get(f"{GAMMA_HOST}/markets?clob_token_ids={token_id}", proxies=proxies, timeout=15)
        r.raise_for_status()
        data = r.json()
    except requests.exceptions.JSONDecodeError:
        return {"error": f"API returned empty/invalid JSON for token {token_id}"}
    except requests.exceptions.RequestException as e:
        return {"error": f"Request failed for token {token_id}: {e}"}
    if isinstance(data, list) and data:
        return format_market(data[0])
    if isinstance(data, dict) and data.get("question"):
        return format_market(data)
    return {"error": f"No market found for token {token_id}"}

def get_market_by_slug(slug, proxies):
    """Get market info by slug via Gamma API."""
    # Try direct slug endpoint
    try:
        r = requests.get(f"{GAMMA_HOST}/markets/{slug}", proxies=proxies, timeout=15)
        if r.status_code == 200:
            data = r.json()
            m = data[0] if isinstance(data, list) and data else data if isinstance(data, dict) else None
            if m:
                return format_market(m)
    except requests.exceptions.JSONDecodeError:
        pass  # Try fallback
    except requests.exceptions.RequestException:
        pass  # Try fallback
    # Fallback: query param
    try:
        r = requests.get(f"{GAMMA_HOST}/markets?slug={slug}", proxies=proxies, timeout=15)
        if r.status_code == 200:
            data = r.json()
            m = data[0] if isinstance(data, list) and data else data if isinstance(data, dict) else None
            if m:
                return format_market(m)
    except requests.exceptions.JSONDecodeError:
        return {"error": f"API returned empty/invalid JSON for slug '{slug}'"}
    except requests.exceptions.RequestException as e:
        return {"error": f"Request failed for slug '{slug}': {e}"}
    return {"error": f"No market found for slug '{slug}'"}

def get_price_info(token_id, proxies):
    """Get price/book info from CLOB API."""
    try:
        r = requests.get(f"{CLOB_HOST}/midpoint?token_id={token_id}", proxies=proxies, timeout=10)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return None

def format_market(market):
    """Format market data into a clean dict."""
    tokens_raw = market.get("clobTokenIds", [])
    outcomes_raw = market.get("outcomes", [])
    # Handle JSON-encoded strings
    if isinstance(tokens_raw, str):
        try: tokens_raw = json.loads(tokens_raw)
        except: tokens_raw = []
    if isinstance(outcomes_raw, str):
        try: outcomes_raw = json.loads(outcomes_raw)
        except: outcomes_raw = []
    if not isinstance(tokens_raw, list): tokens_raw = []
    if not isinstance(outcomes_raw, list): outcomes_raw = []

    tokens = {}
    for i, outcome in enumerate(outcomes_raw):
        if i < len(tokens_raw):
            tokens[outcome] = tokens_raw[i]

    return {
        "question": market.get("question", ""),
        "slug": market.get("slug", ""),
        "condition_id": market.get("conditionId", ""),
        "neg_risk": market.get("negRisk", False),
        "active": market.get("active", False),
        "closed": market.get("closed", False),
        "end_date": market.get("endDate", ""),
        "description": market.get("description", "")[:500],
        "tokens": tokens,
        "volume": market.get("volume", ""),
        "volume_24hr": market.get("volume24hr", ""),
        "liquidity": market.get("liquidity", ""),
        "best_bid": market.get("bestBid", ""),
        "best_ask": market.get("bestAsk", ""),
        "last_trade_price": market.get("lastTradePrice", ""),
        "outcomes_prices": market.get("outcomePrices", ""),
    }

def main():
    parser = argparse.ArgumentParser(description="Polymarket market info lookup")
    parser.add_argument("identifier", help="CLOB token ID (numeric) or market slug")
    parser.add_argument("--proxy", help="SOCKS5 proxy (default: socks5h://127.0.0.1:7880)")
    parser.add_argument("--prices", action="store_true", help="Also fetch price/midpoint from CLOB")
    args = parser.parse_args()

    proxies = get_proxy(args.proxy)
    identifier = args.identifier.strip()

    # Heuristic: CLOB token IDs are purely numeric and very long (70+ digits)
    # Slugs contain hyphens and letters
    if identifier.isdigit() and len(identifier) > 30:
        result = get_market_by_token(identifier, proxies)
    else:
        result = get_market_by_slug(identifier, proxies)

    if args.prices and "tokens" in result and isinstance(result["tokens"], dict):
        result["price_info"] = {}
        for outcome, tid in result["tokens"].items():
            pi = get_price_info(tid, proxies)
            if pi:
                result["price_info"][outcome] = pi

    print(json.dumps(result, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
