#!/usr/bin/env python3
"""
Polymarket order placement via requests + py_order_utils.
Bypasses py_clob_client's httpx (which doesn't work with SOCKS proxy).

Usage:
  python3 trade.py derive-key
  python3 trade.py sell <token_id> --price 0.54 --size 8
  python3 trade.py buy <token_id> --price 0.05 --size 100
"""

import os, sys, json, time, argparse, hmac, hashlib, base64
import requests

from py_order_utils.builders import OrderBuilder
from py_order_utils.signer import Signer
from py_order_utils.model.order import OrderData
from py_order_utils.model.sides import BUY as SIDE_BUY, SELL as SIDE_SELL
from py_order_utils.model.signatures import EOA, POLY_PROXY

CLOB_HOST = "https://clob.polymarket.com"
GAMMA_HOST = "https://gamma-api.polymarket.com"
CHAIN_ID = 137
USDC_DECIMALS = 6

# Exchange contracts on Polygon (from official SDK config.ts)
EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E"          # regular CTF Exchange
NEG_RISK_EXCHANGE = "0xC5d563A36AE78145C45a50134d48A1215220f80a"  # negRisk CTF Exchange

PROXIES = {"https": os.environ.get("SOCKS5_PROXY", "socks5h://127.0.0.1:7880")}

def get_env(name, required=True):
    v = os.environ.get(name)
    if required and not v:
        print(f"Error: {name} not set", file=sys.stderr)
        sys.exit(1)
    return v


# ── HMAC Auth ────────────────────────────────────────────────

def hmac_sign(secret, timestamp, method, path, body=""):
    """Build HMAC-SHA256 signature (url-safe base64), matching official SDK."""
    message = str(timestamp) + method + path + (body or "")
    key = base64.urlsafe_b64decode(secret)
    sig = hmac.new(key, message.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(sig).decode()

def l2_headers(api_key, api_secret, api_passphrase, signer_addr, method, path, body=""):
    """Build L2 auth headers. IMPORTANT: sign path WITHOUT query string."""
    sign_path = path.split("?")[0]  # Strip query string for HMAC
    ts = str(int(time.time()))
    sig = hmac_sign(api_secret, ts, method, sign_path, body)
    return {
        "POLY_ADDRESS": signer_addr,
        "POLY_SIGNATURE": sig,
        "POLY_TIMESTAMP": ts,
        "POLY_API_KEY": api_key,
        "POLY_PASSPHRASE": api_passphrase,
        "Content-Type": "application/json",
    }


# ── L1 Auth (EIP-712) for key management ────────────────────

def l1_headers_via_node(pk):
    """Use Node.js to generate L1 headers (ethers EIP-712 signing)."""
    import subprocess
    script = f"""
    const {{ buildL1Headers, getWallet }} = require('./lib/auth');
    (async () => {{
        const w = getWallet();
        const h = await buildL1Headers(w);
        console.log(JSON.stringify(h));
    }})();
    """
    result = subprocess.run(
        ["node", "-e", script],
        capture_output=True, text=True,
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        env={**os.environ},
        timeout=15,
    )
    if result.returncode != 0:
        raise RuntimeError(f"L1 headers failed: {result.stderr}")
    return json.loads(result.stdout.strip())


# ── Market Info ──────────────────────────────────────────────

def get_market_info(token_id):
    """Get market metadata from Gamma API."""
    r = requests.get(f"{GAMMA_HOST}/markets?clob_token_ids={token_id}", proxies=PROXIES, timeout=15)
    markets = r.json()
    if markets:
        return markets[0]
    return None

def get_tick_size(token_id):
    """Get minimum tick size from CLOB API."""
    r = requests.get(f"{CLOB_HOST}/tick-size?token_id={token_id}", proxies=PROXIES, timeout=15)
    return r.json().get("minimum_tick_size", 0.01)


# ── Key Management ───────────────────────────────────────────

def derive_key():
    """Derive API key using L1 auth."""
    headers = l1_headers_via_node(get_env("POLYMARKET_PRIVATE_KEY"))
    r = requests.get(f"{CLOB_HOST}/auth/derive-api-key", headers=headers, proxies=PROXIES, timeout=15)
    print(f"Status: {r.status_code}")
    print(json.dumps(r.json(), indent=2))
    return r.json()

def create_key():
    """Create new API key using L1 auth."""
    headers = l1_headers_via_node(get_env("POLYMARKET_PRIVATE_KEY"))
    headers["Content-Type"] = "application/json"
    r = requests.post(f"{CLOB_HOST}/auth/api-key", json={}, headers=headers, proxies=PROXIES, timeout=15)
    print(f"Status: {r.status_code}")
    print(json.dumps(r.json(), indent=2))
    return r.json()


# ── Order Placement ──────────────────────────────────────────

def place_order(token_id, side, price, size):
    pk = get_env("POLYMARKET_PRIVATE_KEY")
    api_key = get_env("POLYMARKET_API_KEY")
    api_secret = get_env("POLYMARKET_API_SECRET")
    api_passphrase = get_env("POLYMARKET_API_PASSPHRASE")
    funder = get_env("POLYMARKET_FUNDER", required=False) or None
    sig_type_str = os.environ.get("POLYMARKET_SIGNATURE_TYPE", "0")
    sig_type = int(sig_type_str)

    signer_obj = Signer(pk)
    signer_addr = signer_obj.address()
    maker = funder or signer_addr

    # Determine negRisk from market metadata
    market = get_market_info(token_id)
    neg_risk = market.get("negRisk", False) if market else False
    exchange_addr = NEG_RISK_EXCHANGE if neg_risk else EXCHANGE
    
    print(f"Market: {market['question'][:60] if market else 'unknown'}")
    print(f"negRisk: {neg_risk} → exchange: {exchange_addr[:10]}...")
    print(f"Signer: {signer_addr}")
    print(f"Maker: {maker}")
    print(f"Side: {side} | Price: {price} | Size: {size}")

    # Calculate amounts
    side_enum = SIDE_BUY if side == "BUY" else SIDE_SELL
    sig_type_enum = POLY_PROXY if sig_type == 1 else EOA

    if side == "BUY":
        raw_maker = round(size * price, 6)
        raw_taker = round(size, 2)
    else:
        raw_maker = round(size, 2)
        raw_taker = round(size * price, 6)

    maker_amount = str(int(raw_maker * (10 ** USDC_DECIMALS)))
    taker_amount = str(int(raw_taker * (10 ** USDC_DECIMALS)))

    print(f"makerAmount: {maker_amount} | takerAmount: {taker_amount}")

    # Build and sign order
    builder = OrderBuilder(
        exchange_address=exchange_addr,
        chain_id=CHAIN_ID,
        signer=signer_obj,
    )

    order_data = OrderData(
        maker=maker,
        taker="0x0000000000000000000000000000000000000000",
        tokenId=token_id,
        makerAmount=maker_amount,
        takerAmount=taker_amount,
        side=side_enum,
        feeRateBps="0",
        nonce="0",
        signer=signer_addr,
        expiration="0",
        signatureType=sig_type_enum,
    )

    signed = builder.build_signed_order(order_data)
    order_dict = signed.dict()

    body = {
        "order": order_dict,
        "owner": maker,
        "orderType": "GTC",
    }

    body_str = json.dumps(body, separators=(',', ':'))
    headers = l2_headers(api_key, api_secret, api_passphrase, signer_addr, "POST", "/order", body_str)

    print(f"\nPosting order...")
    r = requests.post(f"{CLOB_HOST}/order", data=body_str, headers=headers, proxies=PROXIES, timeout=15)
    print(f"Status: {r.status_code}")
    print(f"Response: {r.text}")
    return r.json() if r.status_code == 200 else None


def main():
    parser = argparse.ArgumentParser(description="Polymarket Trading CLI")
    sub = parser.add_subparsers(dest="cmd")

    sub.add_parser("derive-key")
    sub.add_parser("create-key")

    buy_p = sub.add_parser("buy")
    buy_p.add_argument("token_id")
    buy_p.add_argument("--price", type=float, required=True)
    buy_p.add_argument("--size", type=float, required=True)

    sell_p = sub.add_parser("sell")
    sell_p.add_argument("token_id")
    sell_p.add_argument("--price", type=float, required=True)
    sell_p.add_argument("--size", type=float, required=True)

    args = parser.parse_args()

    if args.cmd == "derive-key":
        derive_key()
    elif args.cmd == "create-key":
        create_key()
    elif args.cmd == "buy":
        place_order(args.token_id, "BUY", args.price, args.size)
    elif args.cmd == "sell":
        place_order(args.token_id, "SELL", args.price, args.size)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
