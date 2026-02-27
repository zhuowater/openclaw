#!/usr/bin/env node
/**
 * Polymarket CLI — quick access to market queries and trading.
 *
 * Usage:
 *   node polymarket.js markets [--limit N] [--tag TAG]
 *   node polymarket.js events  [--limit N]
 *   node polymarket.js market  <slug-or-id>
 *   node polymarket.js book    <tokenId>
 *   node polymarket.js price   <tokenId> [--side buy|sell]
 *   node polymarket.js balance
 *   node polymarket.js positions
 *   node polymarket.js orders  [--market TOKEN_ID]
 *   node polymarket.js order   <orderId>
 *   node polymarket.js buy     <tokenId> --price 0.55 --size 10
 *   node polymarket.js sell    <tokenId> --price 0.65 --size 10
 *   node polymarket.js cancel  <orderId>
 *   node polymarket.js cancel-all
 *   node polymarket.js derive-key
 *   node polymarket.js create-key
 */

const poly = require('..');

// ── Arg parsing ─────────────────────────────────────────────

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(argv[i]);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

// ── Formatting helpers ──────────────────────────────────────

function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

function printMarketSummary(m) {
  const question = m.question || m.title || m.description || '(no title)';
  const price = m.outcomePrices
    ? JSON.parse(m.outcomePrices).map((p, i) => `${(m.outcomes ? JSON.parse(m.outcomes)[i] : `Outcome ${i}`)}=${(parseFloat(p) * 100).toFixed(1)}%`).join(' | ')
    : m.bestBid ? `bid=${m.bestBid} ask=${m.bestAsk}` : '';
  const volume = m.volume ? ` vol=$${Number(m.volume).toLocaleString()}` : '';
  const liquidity = m.liquidityNum ? ` liq=$${Number(m.liquidityNum).toLocaleString()}` : '';
  console.log(`  ${question}`);
  console.log(`    ${price}${volume}${liquidity}`);
  if (m.conditionId) console.log(`    condition: ${m.conditionId}`);
  if (m.slug) console.log(`    slug: ${m.slug}`);
  console.log();
}

// ── Commands ────────────────────────────────────────────────

async function main() {
  try {
    switch (command) {
      case 'markets': {
        const params = {
          limit: args.limit || 10,
          active: true,
          closed: false,
        };
        if (args.tag) params.tag_id = args.tag;
        if (args.offset) params.offset = args.offset;
        const markets = await poly.getMarkets(params);
        console.log(`\n📊 Active Markets (showing ${markets.length}):\n`);
        for (const m of markets) printMarketSummary(m);
        break;
      }

      case 'events': {
        const params = { limit: args.limit || 10, active: true, closed: false };
        const events = await poly.getEvents(params);
        console.log(`\n📅 Events (showing ${events.length}):\n`);
        for (const e of events) {
          console.log(`  ${e.title || e.slug}`);
          if (e.markets) console.log(`    ${e.markets.length} markets`);
          console.log();
        }
        break;
      }

      case 'market': {
        const id = args._[1];
        if (!id) { console.error('Usage: market <slug-or-id>'); process.exit(1); }
        const m = await poly.getMarket(id);
        if (Array.isArray(m) && m.length > 0) {
          printMarketSummary(m[0]);
        } else {
          printMarketSummary(m);
        }
        break;
      }

      case 'book': {
        const tokenId = args._[1];
        if (!tokenId) { console.error('Usage: book <tokenId>'); process.exit(1); }
        const book = await poly.getOrderBook(tokenId);
        printJson(book);
        break;
      }

      case 'price': {
        const tokenId = args._[1];
        if (!tokenId) { console.error('Usage: price <tokenId>'); process.exit(1); }
        const side = args.side || 'buy';
        const price = await poly.getPrice(tokenId, side);
        printJson(price);
        break;
      }

      case 'balance': {
        const bal = await poly.getBalance();
        printJson(bal);
        break;
      }

      case 'positions': {
        const pos = await poly.getPositions();
        printJson(pos);
        break;
      }

      case 'orders': {
        const params = {};
        if (args.market) params.market = args.market;
        const orders = await poly.getOpenOrders(params);
        printJson(orders);
        break;
      }

      case 'order': {
        const oid = args._[1];
        if (!oid) { console.error('Usage: order <orderId>'); process.exit(1); }
        const o = await poly.getOrder(oid);
        printJson(o);
        break;
      }

      case 'buy':
      case 'sell': {
        const tokenId = args._[1];
        if (!tokenId || !args.price || !args.size) {
          console.error(`Usage: ${command} <tokenId> --price 0.55 --size 10`);
          process.exit(1);
        }
        const result = await poly.placeOrder({
          tokenId,
          side: command.toUpperCase(),
          price: parseFloat(args.price),
          size: parseFloat(args.size),
          type: args.type || 'GTC',
        });
        printJson(result);
        break;
      }

      case 'cancel': {
        const oid = args._[1];
        if (!oid) { console.error('Usage: cancel <orderId>'); process.exit(1); }
        const result = await poly.cancelOrder(oid);
        printJson(result);
        break;
      }

      case 'cancel-all': {
        const result = await poly.cancelAllOrders();
        printJson(result);
        break;
      }

      case 'derive-key': {
        const nonce = args.nonce;
        const result = await poly.deriveApiKey(undefined, nonce);
        printJson(result);
        break;
      }

      case 'create-key': {
        const result = await poly.createApiKey();
        printJson(result);
        break;
      }

      default:
        console.log(`
Polymarket CLI

Commands:
  markets [--limit N]                    Browse active markets
  events  [--limit N]                    Browse events
  market  <slug-or-id>                   Market details
  book    <tokenId>                      Order book
  price   <tokenId> [--side buy|sell]    Best price

  balance                                Account balance (needs key)
  positions                              Current positions (needs key)
  orders  [--market TOKEN_ID]            Open orders (needs key)
  order   <orderId>                      Order details (needs key)

  buy  <tokenId> --price P --size S      Place buy order (needs key)
  sell <tokenId> --price P --size S      Place sell order (needs key)
  cancel     <orderId>                   Cancel order (needs key)
  cancel-all                             Cancel all orders (needs key)

  derive-key [--nonce N]                 Derive API key from private key
  create-key                             Create new API key

Environment:
  POLYMARKET_PRIVATE_KEY    Ethereum private key
  POLYMARKET_API_KEY        API key (optional if derived)
  POLYMARKET_API_SECRET     API secret
  POLYMARKET_API_PASSPHRASE API passphrase
  SOCKS5_PROXY              SOCKS5 proxy (default: socks5://127.0.0.1:7880)
`);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.data) console.error('Response:', JSON.stringify(err.data, null, 2));
    process.exit(1);
  }
}

main();
