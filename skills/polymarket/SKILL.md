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
├── SKILL.md          # This file
├── package.json
├── scripts/
│   └── polymarket.js # CLI tool
└── lib/
    ├── client.js     # HTTP client with SOCKS5 proxy
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

## CLI Reference

```bash
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
```

## Auth Flow

1. **L1 Auth** — EIP-712 signature over `ClobAuthDomain` (chainId 137). Used for key management endpoints.
2. **L2 Auth** — HMAC-SHA256 using derived `(apiKey, secret, passphrase)`. Used for all trading endpoints.
3. If no API creds in env, the skill auto-derives them from `POLYMARKET_PRIVATE_KEY`.

## Key Details

- **Gamma API**: `https://gamma-api.polymarket.com` — public market data
- **CLOB API**: `https://clob.polymarket.com` — trading endpoints
- **Chain**: Polygon (chainId 137)
- **Token amounts**: USDC with 6 decimals
- **Order signing**: EIP-712 via Polymarket CTF Exchange contract
