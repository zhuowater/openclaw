/**
 * Polymarket L1 & L2 authentication.
 *
 * L1 auth: EIP-712 signature with the user's private key.
 * L2 auth: HMAC-SHA256 signed headers using derived API credentials.
 */

const { ethers } = require('ethers');
const crypto = require('crypto');
const { clobGet, clobPost } = require('./client');

// ── EIP-712 Domain & Types ──────────────────────────────────

const CLOB_AUTH_DOMAIN = {
  name: 'ClobAuthDomain',
  version: '1',
  chainId: 137,
};

const CLOB_AUTH_TYPES = {
  ClobAuth: [
    { name: 'address',   type: 'address' },
    { name: 'timestamp', type: 'string'  },
    { name: 'nonce',     type: 'uint256' },
    { name: 'message',   type: 'string'  },
  ],
};

// ── Helpers ─────────────────────────────────────────────────

function getWallet(privateKey) {
  if (!privateKey) {
    privateKey = process.env.POLYMARKET_PRIVATE_KEY;
  }
  if (!privateKey) throw new Error('No private key provided. Set POLYMARKET_PRIVATE_KEY env var.');
  return new ethers.Wallet(privateKey);
}

function nowTimestamp() {
  return Math.floor(Date.now() / 1000).toString();
}

function randomNonce() {
  return Math.floor(Math.random() * 1e12);
}

// ── L1 Auth (EIP-712 Signature) ─────────────────────────────

/**
 * Build L1 auth headers.
 * Signs an EIP-712 message for the CLOB API.
 */
async function buildL1Headers(wallet) {
  const timestamp = nowTimestamp();
  const nonce = randomNonce();
  const address = await wallet.getAddress();

  const value = {
    address,
    timestamp,
    nonce,
    message: 'This message attests that I control the given wallet',
  };

  // ethers v5: _signTypedData
  const signature = await wallet._signTypedData(
    CLOB_AUTH_DOMAIN,
    CLOB_AUTH_TYPES,
    value
  );

  return {
    POLY_ADDRESS:   address,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: timestamp,
    POLY_NONCE:     nonce.toString(),
  };
}

// ── L2 Auth (HMAC-SHA256) ───────────────────────────────────

/**
 * Build L2 HMAC signature.
 * sign = HMAC-SHA256(secret, timestamp + method + requestPath + body)
 * Note: Uses URL-safe base64 (compatible with official Polymarket SDK)
 */
function hmacSign(secret, timestamp, method, requestPath, body = '') {
  const message = String(timestamp) + method.toUpperCase() + requestPath + (body || '');
  // Decode secret using URL-safe base64 (replace - with +, _ with /)
  const secretBuf = Buffer.from(secret.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const sig = crypto
    .createHmac('sha256', secretBuf)
    .update(message)
    .digest();
  // Encode signature as URL-safe base64
  return sig.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Build L2 auth headers for a CLOB request.
 */
function buildL2Headers({ apiKey, secret, passphrase }, method, requestPath, body = '') {
  const timestamp = nowTimestamp();
  const signature = hmacSign(secret, timestamp, method, requestPath, body);

  return {
    POLY_ADDRESS:    '', // will be filled by caller if needed
    POLY_SIGNATURE:  signature,
    POLY_TIMESTAMP:  timestamp,
    POLY_NONCE:      randomNonce().toString(),
    POLY_API_KEY:    apiKey,
    POLY_PASSPHRASE: passphrase,
  };
}

// ── API Key Management ──────────────────────────────────────

/**
 * Create a new API key (L1 auth required).
 * POST /auth/api-key
 */
async function createApiKey(privateKey) {
  const wallet = getWallet(privateKey);
  const headers = await buildL1Headers(wallet);
  return clobPost('/auth/api-key', {}, headers);
}

/**
 * Derive an existing API key (L1 auth required).
 * GET /auth/derive-api-key
 */
async function deriveApiKey(privateKey, nonce) {
  const wallet = getWallet(privateKey);
  const headers = await buildL1Headers(wallet);
  let path = '/auth/derive-api-key';
  if (nonce !== undefined) path += `?nonce=${nonce}`;
  return clobGet(path, headers);
}

/**
 * Delete an API key (L1 auth required).
 */
async function deleteApiKey(privateKey) {
  const wallet = getWallet(privateKey);
  const headers = await buildL1Headers(wallet);
  const { clobDelete } = require('./client');
  return clobDelete('/auth/api-key', headers);
}

/**
 * Get or derive API credentials.
 * Returns { apiKey, secret, passphrase } from env vars or by deriving from private key.
 */
async function getCredentials(privateKey) {
  const apiKey = process.env.POLYMARKET_API_KEY;
  const secret = process.env.POLYMARKET_API_SECRET;
  const passphrase = process.env.POLYMARKET_API_PASSPHRASE;

  if (apiKey && secret && passphrase) {
    return { apiKey, secret, passphrase };
  }

  // Derive from private key
  console.error('[auth] Deriving API credentials from private key...');
  const result = await deriveApiKey(privateKey);
  if (!result.apiKey) {
    // Need to create first
    console.error('[auth] No existing key found, creating new API key...');
    const created = await createApiKey(privateKey);
    return {
      apiKey:     created.apiKey,
      secret:     created.secret,
      passphrase: created.passphrase,
    };
  }
  return {
    apiKey:     result.apiKey,
    secret:     result.secret,
    passphrase: result.passphrase,
  };
}

module.exports = {
  CLOB_AUTH_DOMAIN,
  CLOB_AUTH_TYPES,
  getWallet,
  buildL1Headers,
  buildL2Headers,
  hmacSign,
  createApiKey,
  deriveApiKey,
  deleteApiKey,
  getCredentials,
};
