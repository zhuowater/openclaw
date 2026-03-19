---
name: polymarket
description: Query prediction markets, manage authentication, and trade on Polymarket via SOCKS5 proxy. Use for market queries, position checks, order placement, balance inquiries. Triggers on "polymarket", "prediction market", "交易", "持仓".
---

# Polymarket Trading Skill

Query prediction markets, manage authentication, and trade on Polymarket — all through a SOCKS5 proxy.

## Quick Start

```bash
# Browse markets (no auth needed)
node skills/polymarket/scripts/polymarket.js markets --limit 5

# Programmatic usage
const poly = require('./skills/polymarket');
const markets = await poly.getMarkets({ limit: 5, active: true });
```

## Architecture

```
skills/polymarket/
├── index.js          # Main entry — re-exports everything
├── scripts/
│   ├── polymarket.js # Node.js CLI tool
│   ├── trade.py      # Python trading CLI (buy/sell/lookup/derive-key)
│   ├── market_info.py # Python market info lookup (by token ID or slug)
│   ├── balance.py    # Python balance & positions checker
│   └── sentiment_scan.py # Python sentiment/volume scanner
├── SKILL.md          # This file
├── package.json
├── scripts/
│   └── polymarket.js # CLI tool
└── lib/
    ├── client.js     # HTTP client with SOCKS5 proxy (Gamma + CLOB + Data APIs)
    ├── auth.js       # L1 (EIP-712) & L2 (HMAC) auth
    └── trading.js    # Orders, positions, balance
```

## Proxy

**All** HTTP requests go through a SOCKS5 proxy (Polymarket is blocked in China).

Default: `socks5://127.0.0.1:7880`  
Override: set `SOCKS5_PROXY` env var.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SOCKS5_PROXY` | No | SOCKS5 proxy address (default: `socks5://127.0.0.1:7880`) |
| `POLYMARKET_PRIVATE_KEY` | For trading | Ethereum private key (Polygon wallet) |
| `POLYMARKET_API_KEY` | Optional | CLOB API key (can be derived from private key) |
| `POLYMARKET_API_SECRET` | Optional | CLOB API secret |
| `POLYMARKET_API_PASSPHRASE` | Optional | CLOB API passphrase |

## API Reference

### Market Queries (No Auth)

```js
const poly = require('./skills/polymarket');

// Browse active markets
const markets = await poly.getMarkets({ limit: 10, active: true });

// Get single market by slug
const market = await poly.getMarket('will-trump-win-2024');

// Browse events
const events = await poly.getEvents({ limit: 5 });

// Order book for a specific token
const book = await poly.getOrderBook(tokenId);

// Price info
const mid   = await poly.getMidpoint(tokenId);
const price = await poly.getPrice(tokenId, 'buy');
const last  = await poly.getLastTradePrice(tokenId);
```

### Authentication

```js
// Derive API key from private key (one-time setup)
const creds = await poly.deriveApiKey('0xYOUR_PRIVATE_KEY');
// Returns: { apiKey, secret, passphrase }

// Or create a fresh API key
const newKey = await poly.createApiKey('0xYOUR_PRIVATE_KEY');
```

### Trading (Needs Auth)

```js
// Place a limit buy order
const result = await poly.placeOrder({
  tokenId: '12345...',
  side: 'BUY',
  price: 0.55,      // 55 cents
  size: 100,         // 100 shares
  type: 'GTC',       // Good-til-cancelled
});

// Cancel an order
await poly.cancelOrder('order-id-xxx');

// Cancel all open orders
await poly.cancelAllOrders();

// View positions and balance
const positions = await poly.getPositions();
const balance   = await poly.getBalance();
const trades    = await poly.getTradeHistory({ limit: 20 });
const orders    = await poly.getOpenOrders();
```

## ⚠️ Common Error: Never Use Raw `curl | python3` for Market Lookups

**DO NOT** do this (causes recurring `KeyError: 'tokens'`):
```bash
# ❌ WRONG — Gamma API returns clobTokenIds (JSON string), NOT tokens (list)
curl -s 'https://gamma-api.polymarket.com/markets?slug=...' | python3 -c "import json,sys; m=json.load(sys.stdin)[0]; print(m['tokens'])"
```

**Use the safe wrapper instead:**
```bash
# ✅ CORRECT — market_info.py handles all API format quirks
python3 skills/polymarket/scripts/market_info.py "market-slug"
python3 skills/polymarket/scripts/market_info.py "market-slug" --prices

# ✅ CORRECT — trade.py lookup (also safe)
python3 skills/polymarket/scripts/trade.py lookup "market-slug"
```

The Gamma API returns `clobTokenIds` as a **JSON-encoded string** (not a list), and `outcomes` as a JSON-encoded string too. Both `market_info.py` and `trade.py` handle this parsing correctly. Raw `curl | python3` one-liners will break.

## CLI Reference

```bash
# Dashboard (replaces 4 separate calls: balance+positions+markets+orders)
node scripts/polymarket.js dashboard

# Market queries (public)
node scripts/polymarket.js markets --limit 10
node scripts/polymarket.js events --limit 5
node scripts/polymarket.js market <slug>
node scripts/polymarket.js book <tokenId>
node scripts/polymarket.js price <tokenId> --side buy

# Account (needs POLYMARKET_PRIVATE_KEY or API creds)
node scripts/polymarket.js balance
node scripts/polymarket.js positions
node scripts/polymarket.js orders

# Trading (needs auth)
node scripts/polymarket.js buy <tokenId> --price 0.55 --size 10
node scripts/polymarket.js sell <tokenId> --price 0.65 --size 10
node scripts/polymarket.js cancel <orderId>
node scripts/polymarket.js cancel-all

# Key management
node scripts/polymarket.js derive-key
node scripts/polymarket.js create-key

# Python trade CLI (SOCKS5 proxy, HMAC auth)
python3 scripts/trade.py lookup <market-slug>   # Get token IDs by slug (safe list handling)
python3 scripts/trade.py buy <tokenId> --price 0.55 --size 10
python3 scripts/trade.py sell <tokenId> --price 0.65 --size 10
```

## Auth Flow

1. **L1 Auth** — EIP-712 signature over `ClobAuthDomain` (chainId 137). Used for key management endpoints.
2. **L2 Auth** — HMAC-SHA256 using derived `(apiKey, secret, passphrase)`. Used for all trading endpoints.
3. If no API creds in env, the skill auto-derives them from `POLYMARKET_PRIVATE_KEY`.

## Key Details

- **CLOB API**: `https://clob.polymarket.com` — trading, orders, balance, authentication. Requires HMAC auth for most endpoints.
- **Data API**: `https://data-api.polymarket.com` — positions, market history, profile data. **No auth needed.** This is where `/positions` lives.
- **Gamma API**: `https://gamma-api.polymarket.com` — market metadata, events, market browsing. No auth needed.
- **Chain**: Polygon (chainId 137)
- **Token amounts**: USDC with 6 decimals
- **Order signing**: EIP-712 via Polymarket CTF Exchange contract

### ⚠️ API Endpoint Mapping (Important!)

| Endpoint | API | Auth? | Notes |
|---|---|---|---|
| `/positions` | **Data API** | No | Use `?user=<funder_address>` |
| `/balance-allowance` | CLOB API | Yes (HMAC) | Use `?signature_type=1` for proxy wallets |
| `/order` | CLOB API | Yes (HMAC) | Place orders |
| `/data/orders` | CLOB API | Yes (HMAC) | List open orders |
| `/trades` | CLOB API | Yes (HMAC) | Trade history |
| `/book` | CLOB API | No | Order book (public) |
| `/midpoint`, `/price` | CLOB API | No | Price data (public) |
| `/markets`, `/events` | Gamma API | No | Market metadata |

**Common mistake**: Do NOT request `/positions` on CLOB API — it doesn't exist there and will return 404.
