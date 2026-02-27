/**
 * HTTP client with SOCKS5 proxy support for Polymarket API.
 * All requests route through the proxy since Polymarket is blocked in China.
 */

const fetch = require('node-fetch');
const { SocksProxyAgent } = require('socks-proxy-agent');

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API  = 'https://clob.polymarket.com';

function getProxyAgent() {
  const proxy = process.env.SOCKS5_PROXY || 'socks5://127.0.0.1:7880';
  // Use socks5h:// to resolve DNS through the proxy (needed when target is blocked)
  const proxyUrl = proxy.replace(/^socks5:\/\//, 'socks5h://');
  return new SocksProxyAgent(proxyUrl);
}

/**
 * Core HTTP request function — all requests go through SOCKS5 proxy.
 */
async function request(url, options = {}) {
  const agent = getProxyAgent();
  const method = (options.method || 'GET').toUpperCase();
  const defaultHeaders = { 'Accept': 'application/json' };
  // Only add Content-Type for methods with body
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    defaultHeaders['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, {
    ...options,
    agent,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ── Gamma API (public, no auth) ─────────────────────────────

/**
 * Search/browse active markets.
 * @param {Object} params - Query params: limit, offset, active, closed, order, ascending, tag_id, slug, etc.
 */
async function getMarkets(params = {}) {
  const qs = new URLSearchParams();
  // Sensible defaults
  if (!params.limit) params.limit = 20;
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  return request(`${GAMMA_API}/markets?${qs}`);
}

/**
 * Get single market by condition_id or slug.
 */
async function getMarket(idOrSlug) {
  // Try by slug first (Gamma supports slug endpoint)
  return request(`${GAMMA_API}/markets/${encodeURIComponent(idOrSlug)}`);
}

/**
 * Get events list.
 */
async function getEvents(params = {}) {
  const qs = new URLSearchParams();
  if (!params.limit) params.limit = 20;
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  return request(`${GAMMA_API}/events?${qs}`);
}

/**
 * Get a single event by id or slug.
 */
async function getEvent(idOrSlug) {
  return request(`${GAMMA_API}/events/${encodeURIComponent(idOrSlug)}`);
}

// ── CLOB API helpers ────────────────────────────────────────

/**
 * CLOB GET with optional auth headers.
 */
async function clobGet(path, headers = {}) {
  return request(`${CLOB_API}${path}`, { method: 'GET', headers });
}

/**
 * CLOB POST with optional auth headers and body.
 */
async function clobPost(path, body = {}, headers = {}) {
  return request(`${CLOB_API}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * CLOB DELETE with optional auth headers.
 */
async function clobDelete(path, headers = {}, body) {
  const opts = { method: 'DELETE', headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return request(`${CLOB_API}${path}`, opts);
}

// ── Public CLOB endpoints ───────────────────────────────────

/**
 * Get the order book for a token_id (market).
 */
async function getOrderBook(tokenId) {
  return clobGet(`/book?token_id=${encodeURIComponent(tokenId)}`);
}

/**
 * Get mid-prices for markets.
 */
async function getMidpoint(tokenId) {
  return clobGet(`/midpoint?token_id=${encodeURIComponent(tokenId)}`);
}

/**
 * Get price for a market (best bid/ask).
 */
async function getPrice(tokenId, side = 'buy') {
  return clobGet(`/price?token_id=${encodeURIComponent(tokenId)}&side=${side}`);
}

/**
 * Get last trade price.
 */
async function getLastTradePrice(tokenId) {
  return clobGet(`/last-trade-price?token_id=${encodeURIComponent(tokenId)}`);
}

module.exports = {
  GAMMA_API,
  CLOB_API,
  getProxyAgent,
  request,
  // Gamma
  getMarkets,
  getMarket,
  getEvents,
  getEvent,
  // CLOB public
  getOrderBook,
  getMidpoint,
  getPrice,
  getLastTradePrice,
  // Low-level CLOB
  clobGet,
  clobPost,
  clobDelete,
};
