/**
 * Polymarket Skill — main entry point.
 * Re-exports all modules for convenient programmatic use.
 */

const client  = require('./lib/client');
const auth    = require('./lib/auth');
const trading = require('./lib/trading');

module.exports = {
  // ── Market Queries (public, no auth) ──────
  getMarkets:         client.getMarkets,
  getMarket:          client.getMarket,
  getEvents:          client.getEvents,
  getEvent:           client.getEvent,
  getOrderBook:       client.getOrderBook,
  getMidpoint:        client.getMidpoint,
  getPrice:           client.getPrice,
  getLastTradePrice:  client.getLastTradePrice,

  // ── Auth ──────────────────────────────────
  buildL1Headers:     auth.buildL1Headers,
  buildL2Headers:     auth.buildL2Headers,
  createApiKey:       auth.createApiKey,
  deriveApiKey:       auth.deriveApiKey,
  deleteApiKey:       auth.deleteApiKey,
  getCredentials:     auth.getCredentials,
  getWallet:          auth.getWallet,

  // ── Trading (authenticated) ───────────────
  placeOrder:         trading.placeOrder,
  cancelOrder:        trading.cancelOrder,
  cancelAllOrders:    trading.cancelAllOrders,
  getOpenOrders:      trading.getOpenOrders,
  getOrder:           trading.getOrder,
  getPositions:       trading.getPositions,
  getBalance:         trading.getBalance,
  getTradeHistory:    trading.getTradeHistory,
  getBalanceAllowance:trading.getBalanceAllowance,

  // ── Low-level ─────────────────────────────
  client,
  auth,
  trading,
};
