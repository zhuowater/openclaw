/**
 * Trading operations for Polymarket CLOB.
 * All authenticated endpoints use L2 HMAC auth.
 */

const { clobGet, clobPost, clobDelete, dataGet } = require('./client');
const { getWallet, getCredentials, buildL2Headers, buildL1Headers } = require('./auth');

// ── Authenticated request helpers ───────────────────────────

async function authedGet(path, creds, address) {
  // Sign with path only (no query string), matching official SDK behavior
  const signPath = path.split('?')[0];
  const headers = buildL2Headers(creds, 'GET', signPath);
  headers.POLY_ADDRESS = address;
  return clobGet(path, headers);
}

async function authedPost(path, body, creds, address) {
  const bodyStr = JSON.stringify(body);
  const headers = buildL2Headers(creds, 'POST', path, bodyStr);
  headers.POLY_ADDRESS = address;
  return clobPost(path, body, headers);
}

async function authedDelete(path, creds, address, body) {
  const bodyStr = body ? JSON.stringify(body) : '';
  const headers = buildL2Headers(creds, 'DELETE', path, bodyStr);
  headers.POLY_ADDRESS = address;
  return clobDelete(path, headers, body);
}

/**
 * Initialize trading context: wallet + credentials.
 * For proxy wallets (Magic Link / Google login), the funder address
 * is different from the signer (EOA) address.
 */
async function initTrading(privateKey) {
  const wallet = getWallet(privateKey);
  const signerAddress = await wallet.getAddress();
  const funder = process.env.POLYMARKET_FUNDER || signerAddress;
  const sigType = parseInt(process.env.POLYMARKET_SIGNATURE_TYPE || '0', 10);
  const creds = await getCredentials(privateKey);
  // POLY_ADDRESS header always uses signer address (API key is bound to signer)
  return { wallet, address: signerAddress, funder, sigType, creds };
}

// ── Orders ──────────────────────────────────────────────────

/**
 * Place an order on the CLOB.
 *
 * @param {Object} opts
 * @param {string} opts.tokenId   - Token ID of the market outcome
 * @param {string} opts.side      - 'BUY' or 'SELL'
 * @param {number} opts.price     - Limit price (0-1)
 * @param {number} opts.size      - Size in shares (or USDC amount for market orders)
 * @param {string} [opts.type]    - Order type: 'GTC' (default), 'FOK', 'GTD'
 * @param {string} [opts.expiration] - Expiration for GTD orders (unix timestamp)
 * @param {string} [privateKey]
 */
async function placeOrder(opts, privateKey) {
  const { wallet, address, funder, sigType, creds } = await initTrading(privateKey);

  const order = {
    tokenID:    opts.tokenId,
    side:       opts.side.toUpperCase(),
    price:      opts.price,
    size:       opts.size,
    type:       opts.type || 'GTC',
    feeRateBps: opts.feeRateBps || 0,
  };

  if (opts.expiration) {
    order.expiration = opts.expiration;
  }

  // Sign the order with EIP-712 (proxy wallet aware)
  const orderPayload = await signOrder(wallet, order, funder, sigType);

  return authedPost('/order', orderPayload, creds, address);
}

/**
 * Sign a CLOB order using EIP-712 typed data.
 * The CLOB expects a signed order object.
 */
async function signOrder(wallet, order, funder, sigType) {
  // The CLOB order signing domain
  const domain = {
    name:              'Polymarket CTF Exchange',
    version:           '1',
    chainId:           137,
    verifyingContract:  '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E', // Neg Risk CTF Exchange
  };

  const types = {
    Order: [
      { name: 'salt',          type: 'uint256' },
      { name: 'maker',         type: 'address' },
      { name: 'signer',        type: 'address' },
      { name: 'taker',         type: 'address' },
      { name: 'tokenId',       type: 'uint256' },
      { name: 'makerAmount',   type: 'uint256' },
      { name: 'takerAmount',   type: 'uint256' },
      { name: 'expiration',    type: 'uint256' },
      { name: 'nonce',         type: 'uint256' },
      { name: 'feeRateBps',    type: 'uint256' },
      { name: 'side',          type: 'uint8' },
      { name: 'signatureType', type: 'uint8' },
    ],
  };

  const signerAddress = await wallet.getAddress();
  const makerAddress = funder || signerAddress;
  const salt = Math.floor(Math.random() * 1e15).toString();
  const sideNum = order.side === 'BUY' ? 0 : 1;
  const signatureType = sigType || 0;

  // Convert price + size to maker/taker amounts
  // BUY: makerAmount = size * price (USDC), takerAmount = size (shares)
  // SELL: makerAmount = size (shares), takerAmount = size * price (USDC)
  const DECIMALS = 1e6; // USDC has 6 decimals
  let makerAmount, takerAmount;
  if (order.side === 'BUY') {
    makerAmount = Math.round(order.size * order.price * DECIMALS).toString();
    takerAmount = Math.round(order.size * DECIMALS).toString();
  } else {
    makerAmount = Math.round(order.size * DECIMALS).toString();
    takerAmount = Math.round(order.size * order.price * DECIMALS).toString();
  }

  const orderData = {
    salt,
    maker:         makerAddress,   // funder (proxy wallet) for proxy mode
    signer:        signerAddress,  // EOA that signs
    taker:         '0x0000000000000000000000000000000000000000',
    tokenId:       order.tokenID,
    makerAmount,
    takerAmount,
    expiration:    order.expiration || '0',
    nonce:         '0',
    feeRateBps:    (order.feeRateBps || 0).toString(),
    side:          sideNum,
    signatureType, // 0=EOA, 1=POLY_PROXY, 2=GNOSIS_SAFE
  };

  const signature = await wallet._signTypedData(domain, types, orderData);

  return {
    order: {
      ...orderData,
      signature,
    },
    owner:     makerAddress,
    orderType: order.type || 'GTC',
  };
}

/**
 * Cancel an order by order ID.
 */
async function cancelOrder(orderId, privateKey) {
  const { address, funder, creds } = await initTrading(privateKey);
  return authedDelete(path, creds, address);
}

/**
 * Cancel all open orders.
 */
async function cancelAllOrders(privateKey) {
  const { address, funder, creds } = await initTrading(privateKey);
  return authedDelete(path, creds, address);
}

/**
 * Get open orders.
 */
async function getOpenOrders(params = {}, privateKey) {
  const { address, funder, creds } = await initTrading(privateKey);
  const qs = new URLSearchParams(params).toString();
  const path = '/data/orders' + (qs ? `?${qs}` : '');
  return authedGet(path, creds, address);
}

/**
 * Get a single order by ID.
 */
async function getOrder(orderId, privateKey) {
  const { address, funder, creds } = await initTrading(privateKey);
  return authedGet(path, creds, address);
}

// ── Positions & Account ─────────────────────────────────────

/**
 * Get current positions via Data API (no auth needed).
 * The /positions endpoint is on the Data API, NOT the CLOB API.
 * Uses funder address (proxy wallet) as the user identifier.
 */
async function getPositions(privateKey) {
  const { funder } = await initTrading(privateKey);
  return dataGet('/positions', { user: funder });
}

/**
 * Get balance (USDC balance on Polymarket).
 * Uses signature_type param so API returns proxy wallet balance.
 */
async function getBalance(privateKey) {
  const { address, funder, sigType, creds } = await initTrading(privateKey);
  return authedGet(`/balance-allowance?asset_type=COLLATERAL&signature_type=${sigType}`, creds, address);
}

/**
 * Get trade history.
 */
async function getTradeHistory(params = {}, privateKey) {
  const { address, funder, creds } = await initTrading(privateKey);
  const qs = new URLSearchParams(params).toString();
  const path = '/trades' + (qs ? `?${qs}` : '');
  return authedGet(path, creds, address);
}

/**
 * Get balances allowances (detailed).
 */
async function getBalanceAllowance(params = {}, privateKey) {
  const { address, funder, sigType, creds } = await initTrading(privateKey);
  // Always include signature_type so API returns correct wallet balance
  if (!params.signature_type && sigType) params.signature_type = sigType;
  const qs = new URLSearchParams(params).toString();
  const path = '/balance-allowance' + (qs ? `?${qs}` : '');
  return authedGet(path, creds, address);
}

module.exports = {
  initTrading,
  placeOrder,
  signOrder,
  cancelOrder,
  cancelAllOrders,
  getOpenOrders,
  getOrder,
  getPositions,
  getBalance,
  getTradeHistory,
  getBalanceAllowance,
};
