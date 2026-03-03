#!/usr/bin/env python3
"""
Check Polymarket balance and positions.

Usage:
  python3 balance.py                      # Show balance + all positions
  python3 balance.py --balance-only       # Just USDC balance
  python3 balance.py --positions-only     # Just positions
  python3 balance.py --proxy socks5h://...

Output: JSON with balance and/or positions data.

This uses the CLOB API (authenticated) for balance and Data API for positions.
Created to prevent recurring 'file not found' errors from automated sessions.
"""

import os, sys, json, argparse, hmac, hashlib, base64, time
import requests

CLOB_HOST = "https://clob.polymarket.com"
DATA_HOST = "https://data-api.polymarket.com"

def get_proxy(proxy_arg=None):
    proxy = proxy_arg or os.environ.get("SOCKS5_PROXY", "socks5h://127.0.0.1:7880")
    return {"https": proxy, "http": proxy}

def get_env(name, required=True):
    v = os.environ.get(name)
    if required and not v:
        print(json.dumps({"error": f"Missing env var: {name}"}))
        sys.exit(1)
    return v

def hmac_sign(secret, timestamp, method, path, body=""):
    message = str(timestamp) + method + path + (body or "")
    key = base64.urlsafe_b64decode(secret)
    sig = hmac.new(key, message.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(sig).decode()

def l2_headers(api_key, api_secret, api_passphrase, method, path, body=""):
    ts = int(time.time())
    # HMAC path must NOT include query string
    clean_path = path.split("?")[0]
    sig = hmac_sign(api_secret, ts, method, clean_path, body)
    return {
        "POLY_API_KEY": api_key,
        "POLY_SIGNATURE": sig,
        "POLY_TIMESTAMP": str(ts),
        "POLY_PASSPHRASE": api_passphrase,
    }

def get_funder_address():
    """Derive funder (public) address from private key."""
    pk = get_env("POLYMARKET_PRIVATE_KEY")
    try:
        from eth_account import Account
        return Account.from_key(pk).address
    except ImportError:
        # Fallback: try to get from env or derive via node
        funder = os.environ.get("POLYMARKET_FUNDER_ADDRESS")
        if funder:
            return funder
        import subprocess
        result = subprocess.run(
            ["node", "-e", f"const {{Wallet}}=require('ethers');console.log(new Wallet('{pk}').address)"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            return result.stdout.strip()
        raise RuntimeError("Cannot derive funder address: install eth_account or set POLYMARKET_FUNDER_ADDRESS")

def get_balance(proxies):
    """Get USDC balance from CLOB API (authenticated)."""
    api_key = get_env("POLYMARKET_API_KEY")
    api_secret = get_env("POLYMARKET_API_SECRET")
    api_passphrase = get_env("POLYMARKET_API_PASSPHRASE")

    # sig_type=1 for derived/proxy wallets
    path = "/balance-allowance?asset_type=COLLATERAL&signature_type=1"
    headers = l2_headers(api_key, api_secret, api_passphrase, "GET", path)

    try:
        r = requests.get(f"{CLOB_HOST}{path}", headers=headers, proxies=proxies, timeout=15)
        if r.status_code == 200:
            data = r.json()
            # Extract just the balance number
            balance = data.get("balance", data) if isinstance(data, dict) else data
            return {"balance_usdc": balance, "raw": data}
        elif r.status_code == 401:
            return {"error": "API auth failed (401) - may be temporary, retry later", "status": 401}
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
                # Summarize: filter non-zero positions
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
    parser.add_argument("--proxy", help="SOCKS5 proxy (default: socks5h://127.0.0.1:7880)")
    parser.add_argument("--balance-only", action="store_true", help="Only show balance")
    parser.add_argument("--positions-only", action="store_true", help="Only show positions")
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
