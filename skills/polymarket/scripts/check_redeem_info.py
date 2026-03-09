#!/usr/bin/env python3
"""Check what we need for redeeming positions"""

import os, sys, json
import requests
from web3 import Web3
from eth_account import Account

PROXIES = {"https": os.environ.get("SOCKS5_PROXY", "socks5h://127.0.0.1:7880")}
DATA_API = "https://data-api.polymarket.com"

# Get funder address
funder = os.environ.get("POLYMARKET_FUNDER")
print(f"Funder: {funder}\n")

# Get positions
r = requests.get(f"{DATA_API}/positions?user={funder}", proxies=PROXIES, timeout=15)
positions = r.json()

print("Redeemable Iran NO positions:\n")
print(f"{'Title':<60} {'Condition ID':<68} {'Size':<6} {'Value'}")
print("=" * 150)

redeemable = []
for p in positions:
    if 'Iran' in p.get('title', '') and p.get('outcome') == 'No' and p.get('redeemable'):
        title = p['title'][:57] + "..." if len(p['title']) > 60 else p['title']
        print(f"{title:<60} {p['conditionId']:<68} {p['size']:<6.1f} ${p['currentValue']:.4f}")
        redeemable.append(p)

print(f"\nTotal redeemable positions: {len(redeemable)}")

# For Polymarket CTF redemption, we need:
# - conditionId (the market's condition)
# - indexSets (which outcomes to redeem: 1=NO, 2=YES, 3=BOTH)
# 
# Since these are NO positions and the answer is YES (US did strike Iran),
# we should redeem indexSet=1 (the NO outcome)

print("\nRedemption details:")
print("=" * 80)
for p in redeemable:
    print(f"\nMarket: {p['title']}")
    print(f"  conditionId: {p['conditionId']}")
    print(f"  outcomeIndex: {p['outcomeIndex']} (0=YES, 1=NO)")
    print(f"  size: {p['size']} shares")
    print(f"  currentValue: ${p['currentValue']}")
    print(f"  redeemable: {p.get('redeemable')}")
    
    # indexSet is 2^outcomeIndex
    # For NO (index 1): indexSet = 2^1 = 2
    # For YES (index 0): indexSet = 2^0 = 1
    index_set = 2 ** p['outcomeIndex']
    print(f"  indexSet to redeem: {index_set}")
    
    # Command to run
    print(f"  Command: python3 scripts/redeem.py {p['conditionId']} {index_set}")

