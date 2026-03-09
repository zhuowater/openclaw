#!/usr/bin/env python3
"""
Redeem winnings from resolved Polymarket positions via CTF contract.

For proxy wallets (Magic Link/Google auth), the transaction must be sent
from the proxy wallet address, but signed by the EOA private key.

Usage:
  python3 redeem.py <conditionId> <indexSet>

Example:
  python3 redeem.py 0x3488f31e... 2  # Redeem NO outcome (indexSet=2)
"""

import os, sys, json
from web3 import Web3
from eth_account import Account

# Polygon RPC
RPC_URL = os.environ.get("POLYGON_RPC", "https://polygon.llamarpc.com")

# CTF Contract address on Polygon
CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045"

# CTF ABI (minimal - just redeemPositions)
CTF_ABI = json.loads('''[
  {
    "inputs": [
      {"internalType": "contract IERC20", "name": "collateralToken", "type": "address"},
      {"internalType": "bytes32", "name": "parentCollectionId", "type": "bytes32"},
      {"internalType": "bytes32", "name": "conditionId", "type": "bytes32"},
      {"internalType": "uint256[]", "name": "indexSets", "type": "uint256[]"}
    ],
    "name": "redeemPositions",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
]''')

# USDC on Polygon (used as collateral)
USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"

def redeem(condition_id, index_set):
    """Redeem positions for a resolved condition."""
    private_key = os.environ.get("POLYMARKET_PRIVATE_KEY")
    if not private_key:
        print("Error: POLYMARKET_PRIVATE_KEY not set", file=sys.stderr)
        sys.exit(1)

    # Connect to Polygon (no proxy needed for RPC, only for HTTP APIs)
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    
    # Inject PoA middleware for Polygon
    try:
    from web3.middleware import ExtraDataToPOAMiddleware as geth_poa_middleware
except ImportError:
    try:
            from web3.middleware import ExtraDataToPOAMiddleware as geth_poa_middleware
        except ImportError:
            from web3.middleware import geth_poa_middleware
    try:
            w3.middleware_onion.inject(geth_poa_middleware, layer=0)
        except Exception:
            pass
    
    if not w3.is_connected():
        print(f"Error: Cannot connect to Polygon RPC: {RPC_URL}", file=sys.stderr)
        sys.exit(1)

    # Load account
    account = Account.from_key(private_key)
    
    # For proxy wallets, funder is the proxy address (transaction sender)
    # For regular wallets, funder = signer address
    funder = os.environ.get("POLYMARKET_FUNDER", account.address)
    
    print(f"EOA (signer): {account.address}")
    print(f"Funder (tx sender): {funder}")
    print(f"Condition ID: {condition_id}")
    print(f"Index Set: {index_set}")
    print(f"RPC: {RPC_URL}")
    print()

    # Check if this is a proxy wallet setup
    is_proxy = funder.lower() != account.address.lower()
    if is_proxy:
        print("⚠️  Proxy wallet detected!")
        print("    Transaction must be sent from proxy address, but we only have EOA key.")
        print("    This requires the proxy contract to forward the call.")
        print("    Standard web3.py cannot do this directly.\n")
        print("    You need to either:")
        print("    1. Use Polymarket's web interface (https://polymarket.com)")
        print("    2. Use their SDK that handles proxy signing")
        print("    3. Get the proxy wallet's private key (not recommended)\n")
        return None

    # Load contract
    ctf = w3.eth.contract(address=Web3.to_checksum_address(CTF_ADDRESS), abi=CTF_ABI)

    # Parent collection (0x00...00 for base outcomes)
    parent_collection_id = "0x" + "00" * 32
    
    # Build transaction
    try:
        tx = ctf.functions.redeemPositions(
            Web3.to_checksum_address(USDC_ADDRESS),
            parent_collection_id,
            condition_id,
            [index_set]
        ).build_transaction({
            'from': account.address,
            'gas': 300000,
            'maxFeePerGas': w3.eth.gas_price * 2,  # Use EIP-1559
            'maxPriorityFeePerGas': w3.to_wei(30, 'gwei'),
            'nonce': w3.eth.get_transaction_count(account.address),
            'chainId': 137,
        })
    except Exception as e:
        print(f"Error building transaction: {e}")
        return None

    print(f"Transaction details:")
    print(f"  Gas limit: {tx['gas']}")
    print(f"  Max fee: {tx['maxFeePerGas'] / 1e9:.2f} Gwei")
    print(f"  Priority fee: {tx['maxPriorityFeePerGas'] / 1e9:.2f} Gwei")
    print(f"  Nonce: {tx['nonce']}")
    print()

    # Estimate gas cost
    gas_cost_eth = (tx['gas'] * tx['maxFeePerGas']) / 1e18
    print(f"Estimated gas cost: {gas_cost_eth:.6f} MATIC (~${gas_cost_eth * 0.5:.4f} USD)")
    print()

    # Sign and send
    try:
        signed = account.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
        
        print(f"✓ Transaction sent: {tx_hash.hex()}")
        print(f"  Explorer: https://polygonscan.com/tx/{tx_hash.hex()}")
        print(f"  Waiting for confirmation...")
        
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        
        if receipt['status'] == 1:
            print(f"\n✓ SUCCESS!")
            print(f"  Gas used: {receipt['gasUsed']}")
            print(f"  Block: {receipt['blockNumber']}")
        else:
            print(f"\n✗ FAILED!")
            print(f"  Transaction reverted")
        
        return receipt
        
    except Exception as e:
        print(f"✗ Error: {e}")
        return None

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 redeem.py <conditionId> <indexSet>")
        print("\nExample: python3 redeem.py 0x3488f31e... 2")
        print("\nIndex sets:")
        print("  1 = YES outcome (2^0)")
        print("  2 = NO outcome (2^1)")
        sys.exit(1)
    
    condition_id = sys.argv[1]
    if not condition_id.startswith("0x"):
        condition_id = "0x" + condition_id
    
    index_set = int(sys.argv[2])
    
    redeem(condition_id, index_set)

if __name__ == "__main__":
    main()
