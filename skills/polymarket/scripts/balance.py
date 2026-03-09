#!/usr/bin/env python3
"""
Check Polymarket balance and positions.
Uses poly_auth.py for all authentication — single source of truth.
"""
import os, sys, json, argparse
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poly_auth import l2_headers, get_funder_address, get_proxy

CLOB_HOST = "https://clob.polymarket.com"
DATA_HOST = "https://data-api.polymarket.com"


def get_balance(proxies):
    """Get USDC balance from CLOB API (authenticated)."""
    path = "/balance-allowance?asset_type=COLLATERAL&signature_type=1"
    headers = l2_headers("GET", path)
    try:
        r = requests.get(f"{CLOB_HOST}{path}", headers=headers, proxies=proxies, timeout=15)
        if r.status_code == 200:
            data = r.json()
            raw_balance = data.get("balance", "0")
            usdc = int(raw_balance) / 1e6 if raw_balance.isdigit() else raw_balance
            return {"balance_usdc": usdc, "raw": data}
        elif r.status_code == 401:
            return {"error": "API auth failed (401)", "status": 401}
        else:
            return {"error": f"CLOB API returned {r.status_code}", "body": r.text[:500]}
    except Exception as e:
        return {"error": str(e)}


def get_positions(proxies):
    """Get current positions from Data API (no auth needed)."""
    try:
        funder = get_funder_address()
    except Exception as e:
        return {"error": f"Cannot get funder address: {e}"}
    try:
        r = requests.get(f"{DATA_HOST}/positions?user={funder}", proxies=proxies, timeout=15)
        if r.status_code == 200:
            positions = r.json()
            if isinstance(positions, list):
                active = [p for p in positions if float(p.get("size", 0)) > 0]
                return {
                    "funder": funder,
                    "total_positions": len(positions),
                    "active_positions": len(active),
                    "positions": active,
                }
            return {"funder": funder, "positions": positions}
        else:
            return {"error": f"Data API returned {r.status_code}", "body": r.text[:500]}
    except Exception as e:
        return {"error": str(e)}


def main():
    parser = argparse.ArgumentParser(description="Polymarket balance & positions")
    parser.add_argument("--proxy", help="SOCKS5 proxy")
    parser.add_argument("--balance-only", action="store_true")
    parser.add_argument("--positions-only", action="store_true")
    args = parser.parse_args()

    proxies = get_proxy(args.proxy)
    result = {}

    if not args.positions_only:
        result["balance"] = get_balance(proxies)
    if not args.balance_only:
        result["positions"] = get_positions(proxies)

    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
