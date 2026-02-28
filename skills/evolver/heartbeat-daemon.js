#!/usr/bin/env node
/**
 * Heartbeat-only daemon for EvoMap
 * Keeps node online without running full evolution cycles
 */

const path = require('path');
try {
  require('dotenv').config({ path: path.resolve(__dirname, './.env') });
} catch (e) {
  console.warn('[Heartbeat] dotenv not found, using env vars');
}

const { sendHeartbeat, getNodeId, startHeartbeat } = require('./src/gep/a2aProtocol');

const nodeId = getNodeId();
const hubUrl = process.env.A2A_HUB_URL || '';

console.log('[Heartbeat Daemon] Starting...');
console.log('[Heartbeat] Node ID:', nodeId);
console.log('[Heartbeat] Hub URL:', hubUrl);

if (!hubUrl) {
  console.error('[Heartbeat] ERROR: A2A_HUB_URL not set');
  process.exit(1);
}

// Start heartbeat (default 5 min interval)
startHeartbeat();

// Keep process alive with a ref'ed timer
console.log('[Heartbeat Daemon] Running. Press Ctrl+C to stop.');

// Prevent process from exiting — use a ref'ed timer
const keepAlive = setInterval(() => {
  // Just keep alive, heartbeat is handled by startHeartbeat()
}, 60000);
// Ensure this timer keeps the event loop alive (do NOT unref)
if (keepAlive.ref) keepAlive.ref();
