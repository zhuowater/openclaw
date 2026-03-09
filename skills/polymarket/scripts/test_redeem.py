#!/usr/bin/env python3
"""Test if CLOB API has redeem endpoint"""
import os
import requests

CLOB_HOST = "https://clob.polymarket.com"
PROXIES = {"https": os.environ.get("SOCKS5_PROXY", "socks5h://127.0.0.1:7880")}

# Try various possible paths
endpoints = [
    "/redeem",
    "/positions/redeem",
    "/user/redeem",
    "/settlement/redeem",
]

for path in endpoints:
    try:
        r = requests.get(f"{CLOB_HOST}{path}", proxies=PROXIES, timeout=10)
        print(f"{path}: {r.status_code} - {r.text[:100]}")
    except Exception as e:
        print(f"{path}: ERROR - {e}")
