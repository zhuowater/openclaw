"""
Polymarket API 统一认证模块
所有脚本从这里导入，不再各自实现。
"""
import os, hmac, hashlib, base64, time

def get_env(name, fallback=None):
    return os.environ.get(name, fallback)

def get_credentials():
    """获取 API 凭据，统一来源。"""
    return {
        "api_key": get_env("POLYMARKET_API_KEY"),
        "api_secret": get_env("POLYMARKET_API_SECRET"),
        "passphrase": get_env("POLYMARKET_API_PASSPHRASE") or get_env("POLYMARKET_PASSPHRASE"),
        "signer": get_env("POLYMARKET_SIGNER", "0x2e0F12C9Ca303439E8a2F5004324422c033A3f38"),
        "funder": get_env("POLYMARKET_FUNDER") or get_env("POLYMARKET_FUNDER_ADDRESS"),
        "private_key": get_env("POLYMARKET_PRIVATE_KEY"),
    }

def hmac_sign(secret, timestamp, method, path, body=""):
    """HMAC-SHA256 签名（url-safe base64）"""
    message = str(timestamp) + method + path + (body or "")
    key = base64.urlsafe_b64decode(secret)
    sig = hmac.new(key, message.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(sig).decode()

def l2_headers(method, path, body=""):
    """
    构建 L2 认证 headers。
    包含 POLY_ADDRESS（之前 balance.py 漏了这个导致 401）。
    HMAC path 不含 query string（之前也踩过这个坑）。
    """
    creds = get_credentials()
    ts = str(int(time.time()))
    clean_path = path.split("?")[0]
    sig = hmac_sign(creds["api_secret"], ts, method, clean_path, body)
    return {
        "POLY_API_KEY": creds["api_key"],
        "POLY_SIGNATURE": sig,
        "POLY_TIMESTAMP": ts,
        "POLY_PASSPHRASE": creds["passphrase"],
        "POLY_ADDRESS": creds["signer"],
        "Content-Type": "application/json",
    }

def get_funder_address():
    """获取 funder 地址。优先用环境变量（proxy wallet 的 funder ≠ signer）。"""
    creds = get_credentials()
    if creds["funder"]:
        return creds["funder"]
    # 最后才用 private key 推导（注意：得到的是 signer 不是 funder！）
    pk = creds["private_key"]
    if pk:
        try:
            from eth_account import Account
            return Account.from_key(pk).address
        except ImportError:
            pass
    raise RuntimeError("No funder address: set POLYMARKET_FUNDER env var")

def get_proxy(proxy_arg=None):
    proxy = proxy_arg or os.environ.get("SOCKS5_PROXY", "socks5h://127.0.0.1:7880")
    return {"https": proxy, "http": proxy}


# ── 自检 ──
if __name__ == "__main__":
    import requests, json
    creds = get_credentials()
    print(f"API Key: {creds['api_key'][:8]}...")
    print(f"Signer:  {creds['signer']}")
    print(f"Funder:  {creds['funder']}")

    proxies = get_proxy()
    
    # 测试 balance
    path = "/balance-allowance?asset_type=COLLATERAL&signature_type=1"
    headers = l2_headers("GET", path)
    r = requests.get(f"https://clob.polymarket.com{path}", headers=headers, proxies=proxies, timeout=15)
    if r.status_code == 200:
        bal = r.json().get("balance", "?")
        print(f"✅ Balance: ${int(bal)/1e6:.2f} USDC")
    else:
        print(f"❌ Balance failed: {r.status_code} {r.text[:100]}")

    # 测试 positions
    funder = get_funder_address()
    r2 = requests.get(f"https://data-api.polymarket.com/positions?user={funder}", proxies=proxies, timeout=15)
    if r2.status_code == 200:
        positions = [p for p in r2.json() if float(p.get("size", 0)) > 0]
        print(f"✅ Positions: {len(positions)} active")
    else:
        print(f"❌ Positions failed: {r2.status_code}")
