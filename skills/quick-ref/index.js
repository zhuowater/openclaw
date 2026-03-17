#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const STORE_PATH = process.env.QUICK_REF_PATH || path.join(os.homedir(), '.openclaw', 'quick-ref.json');

// ── Helpers ──────────────────────────────────────────────

function ensureDir() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveStore(data) {
  ensureDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2) + '\n');
}

// ── Core API (exported for programmatic use) ─────────────

async function set(key, value) {
  if (!key) throw new Error('key is required');
  const store = loadStore();
  store[key] = {
    value,
    created: store[key]?.created || new Date().toISOString(),
    updated: new Date().toISOString(),
    hits: store[key]?.hits || 0
  };
  saveStore(store);
  return store[key];
}

async function get(key) {
  if (!key) return null;
  const store = loadStore();
  const entry = store[key];
  if (!entry) return null;
  // Track access count
  entry.hits = (entry.hits || 0) + 1;
  entry.lastAccess = new Date().toISOString();
  saveStore(store);
  return entry.value;
}

async function del(key) {
  const store = loadStore();
  if (!(key in store)) return false;
  delete store[key];
  saveStore(store);
  return true;
}

async function list() {
  const store = loadStore();
  return Object.entries(store).map(([k, v]) => ({
    key: k,
    value: typeof v.value === 'string' && v.value.length > 80 ? v.value.slice(0, 77) + '...' : v.value,
    hits: v.hits || 0,
    updated: v.updated
  }));
}

async function search(query) {
  if (!query) return [];
  const q = query.toLowerCase();
  const store = loadStore();
  return Object.entries(store)
    .filter(([k, v]) => {
      const valStr = typeof v.value === 'string' ? v.value : JSON.stringify(v.value);
      return k.toLowerCase().includes(q) || valStr.toLowerCase().includes(q);
    })
    .map(([k, v]) => ({
      key: k,
      value: v.value,
      hits: v.hits || 0,
      updated: v.updated
    }));
}

async function importJson(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const store = loadStore();
  let count = 0;
  for (const [k, v] of Object.entries(data)) {
    store[k] = {
      value: typeof v === 'object' && v.value !== undefined ? v.value : v,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      hits: 0
    };
    count++;
  }
  saveStore(store);
  return count;
}

async function exportJson() {
  return loadStore();
}

async function stats() {
  const store = loadStore();
  const entries = Object.entries(store);
  const totalHits = entries.reduce((sum, [, v]) => sum + (v.hits || 0), 0);
  const topKeys = entries
    .sort(([, a], [, b]) => (b.hits || 0) - (a.hits || 0))
    .slice(0, 5)
    .map(([k, v]) => ({ key: k, hits: v.hits || 0 }));
  return {
    total: entries.length,
    totalHits,
    storePath: STORE_PATH,
    fileSizeBytes: fs.existsSync(STORE_PATH) ? fs.statSync(STORE_PATH).size : 0,
    topKeys
  };
}

// ── CLI ──────────────────────────────────────────────────

async function cli() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  try {
    switch (cmd) {
      case 'set': {
        if (args.length < 3) { console.error('Usage: quick-ref set <key> <value>'); process.exit(1); }
        const key = args[1];
        const value = args.slice(2).join(' ');
        const entry = await set(key, value);
        console.log(`✅ Set "${key}" (updated: ${entry.updated})`);
        break;
      }
      case 'get': {
        if (!args[1]) { console.error('Usage: quick-ref get <key>'); process.exit(1); }
        const val = await get(args[1]);
        if (val === null) { console.log(`❌ Key "${args[1]}" not found`); process.exit(1); }
        console.log(typeof val === 'string' ? val : JSON.stringify(val, null, 2));
        break;
      }
      case 'del':
      case 'delete':
      case 'rm': {
        if (!args[1]) { console.error('Usage: quick-ref del <key>'); process.exit(1); }
        const ok = await del(args[1]);
        console.log(ok ? `✅ Deleted "${args[1]}"` : `❌ Key "${args[1]}" not found`);
        break;
      }
      case 'list':
      case 'ls': {
        const items = await list();
        if (items.length === 0) { console.log('(empty store)'); break; }
        const maxKeyLen = Math.min(30, Math.max(...items.map(i => i.key.length)));
        for (const item of items) {
          const k = item.key.padEnd(maxKeyLen);
          const h = String(item.hits).padStart(3);
          const v = typeof item.value === 'string' ? item.value : JSON.stringify(item.value);
          console.log(`  ${k}  [${h} hits]  ${v}`);
        }
        console.log(`\n${items.length} entries total`);
        break;
      }
      case 'search':
      case 'find': {
        if (!args[1]) { console.error('Usage: quick-ref search <query>'); process.exit(1); }
        const hits = await search(args.slice(1).join(' '));
        if (hits.length === 0) { console.log('No matches.'); break; }
        for (const h of hits) {
          console.log(`  ${h.key}: ${typeof h.value === 'string' ? h.value : JSON.stringify(h.value)}`);
        }
        console.log(`\n${hits.length} matches`);
        break;
      }
      case 'import': {
        if (!args[1]) { console.error('Usage: quick-ref import <file.json>'); process.exit(1); }
        const n = await importJson(args[1]);
        console.log(`✅ Imported ${n} entries`);
        break;
      }
      case 'export': {
        const data = await exportJson();
        console.log(JSON.stringify(data, null, 2));
        break;
      }
      case 'stats': {
        const s = await stats();
        console.log(`📊 Quick Ref Stats`);
        console.log(`  Entries: ${s.total}`);
        console.log(`  Total hits: ${s.totalHits}`);
        console.log(`  Store: ${s.storePath} (${s.fileSizeBytes} bytes)`);
        if (s.topKeys.length > 0) {
          console.log(`  Top keys:`);
          for (const t of s.topKeys) console.log(`    ${t.key}: ${t.hits} hits`);
        }
        break;
      }
      default:
        console.log('Usage: quick-ref <set|get|del|list|search|import|export|stats> [args...]');
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// ── Exports ──────────────────────────────────────────────

module.exports = { set, get, del, list, search, importJson, exportJson, stats };

if (require.main === module) {
  cli().catch(err => { console.error(err); process.exit(1); });
}
