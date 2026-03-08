#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// --- Config ---
const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../..');
const ARCHIVE_DIR = path.join(WORKSPACE, 'memory', 'web-archive');
const INDEX_PATH = path.join(ARCHIVE_DIR, 'index.json');
const MAX_AGE_HOURS = parseInt(process.env.WEB_ARCHIVE_MAX_AGE_HOURS || '168', 10); // 7 days default
const MAX_ENTRIES = parseInt(process.env.WEB_ARCHIVE_MAX_ENTRIES || '500', 10);
const MAX_SIZE_KB = parseInt(process.env.WEB_ARCHIVE_MAX_SIZE_KB || '200', 10); // per entry

// Ensure archive dir
if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

// --- Helpers ---
function urlHash(url) {
  return crypto.createHash('sha256').update(url.trim().toLowerCase()).digest('hex').slice(0, 16);
}

function loadIndex() {
  if (!fs.existsSync(INDEX_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8')); }
  catch { return {}; }
}

function saveIndex(idx) {
  fs.writeFileSync(INDEX_PATH, JSON.stringify(idx, null, 2));
}

function entryPath(hash) {
  return path.join(ARCHIVE_DIR, `${hash}.md`);
}

// --- Core Functions ---

/**
 * Save a URL's content to the local archive
 * @param {string} url - The URL to archive
 * @param {string} content - The page content (markdown/text)
 * @param {object} meta - Optional metadata (title, fetchedAt, etc.)
 * @returns {object} - { hash, path, size, isUpdate }
 */
function save(url, content, meta = {}) {
  const hash = urlHash(url);
  const idx = loadIndex();
  const isUpdate = !!idx[hash];
  
  // Truncate if too large
  const maxBytes = MAX_SIZE_KB * 1024;
  let finalContent = content;
  if (Buffer.byteLength(content, 'utf-8') > maxBytes) {
    finalContent = content.slice(0, maxBytes) + '\n\n[...TRUNCATED at ' + MAX_SIZE_KB + 'KB...]';
  }
  
  // Write content
  const header = [
    `<!-- web-archive: ${url} -->`,
    `<!-- archived: ${new Date().toISOString()} -->`,
    meta.title ? `<!-- title: ${meta.title} -->` : '',
    '',
  ].filter(Boolean).join('\n');
  
  fs.writeFileSync(entryPath(hash), header + finalContent);
  
  // Update index
  idx[hash] = {
    url,
    title: meta.title || '',
    archivedAt: new Date().toISOString(),
    size: Buffer.byteLength(finalContent, 'utf-8'),
    hash,
  };
  
  // Enforce max entries (evict oldest)
  const entries = Object.entries(idx);
  if (entries.length > MAX_ENTRIES) {
    entries.sort((a, b) => new Date(a[1].archivedAt) - new Date(b[1].archivedAt));
    const toRemove = entries.slice(0, entries.length - MAX_ENTRIES);
    for (const [h] of toRemove) {
      const fp = entryPath(h);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      delete idx[h];
    }
  }
  
  saveIndex(idx);
  return { hash, path: entryPath(hash), size: idx[hash].size, isUpdate };
}

/**
 * Get cached content for a URL
 * @param {string} url - URL to look up
 * @param {object} opts - { maxAgeHours, allowStale }
 * @returns {object|null} - { content, meta } or null if not found/expired
 */
function get(url, opts = {}) {
  const hash = urlHash(url);
  const idx = loadIndex();
  const entry = idx[hash];
  if (!entry) return null;
  
  const fp = entryPath(hash);
  if (!fs.existsSync(fp)) {
    delete idx[hash];
    saveIndex(idx);
    return null;
  }
  
  const ageHours = (Date.now() - new Date(entry.archivedAt).getTime()) / (1000 * 60 * 60);
  const maxAge = opts.maxAgeHours || MAX_AGE_HOURS;
  const allowStale = opts.allowStale !== false; // default: true
  
  if (ageHours > maxAge && !allowStale) return null;
  
  const content = fs.readFileSync(fp, 'utf-8');
  return {
    content,
    meta: entry,
    stale: ageHours > maxAge,
    ageHours: Math.round(ageHours * 10) / 10,
  };
}

/**
 * Search archive by keyword in URL or title
 * @param {string} query - Search term
 * @returns {Array} - Matching entries with metadata
 */
function search(query) {
  const idx = loadIndex();
  const q = query.toLowerCase();
  return Object.values(idx).filter(e =>
    e.url.toLowerCase().includes(q) || e.title.toLowerCase().includes(q)
  ).sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt));
}

/**
 * Get archive statistics
 * @returns {object} - { totalEntries, totalSizeKB, oldestEntry, newestEntry, staleCount }
 */
function stats() {
  const idx = loadIndex();
  const entries = Object.values(idx);
  if (entries.length === 0) return { totalEntries: 0, totalSizeKB: 0 };
  
  const totalSize = entries.reduce((s, e) => s + (e.size || 0), 0);
  const now = Date.now();
  const staleCount = entries.filter(e => 
    (now - new Date(e.archivedAt).getTime()) / (1000 * 60 * 60) > MAX_AGE_HOURS
  ).length;
  
  entries.sort((a, b) => new Date(a.archivedAt) - new Date(b.archivedAt));
  
  return {
    totalEntries: entries.length,
    totalSizeKB: Math.round(totalSize / 1024),
    oldestEntry: entries[0]?.archivedAt,
    newestEntry: entries[entries.length - 1]?.archivedAt,
    staleCount,
    maxEntries: MAX_ENTRIES,
    maxAgeHours: MAX_AGE_HOURS,
  };
}

/**
 * Prune entries older than maxAgeHours
 * @param {number} maxAge - Max age in hours (default: MAX_AGE_HOURS)
 * @returns {number} - Number of entries removed
 */
function prune(maxAge = MAX_AGE_HOURS) {
  const idx = loadIndex();
  const now = Date.now();
  let removed = 0;
  
  for (const [hash, entry] of Object.entries(idx)) {
    const ageHours = (now - new Date(entry.archivedAt).getTime()) / (1000 * 60 * 60);
    if (ageHours > maxAge) {
      const fp = entryPath(hash);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      delete idx[hash];
      removed++;
    }
  }
  
  saveIndex(idx);
  return removed;
}

// --- CLI ---
if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  
  if (cmd === 'save' && args[1]) {
    // save <url> [title] — reads content from stdin
    const url = args[1];
    const title = args[2] || '';
    let content = '';
    try { content = fs.readFileSync(0, 'utf-8'); } catch {}
    if (!content) {
      console.error('Error: pipe content via stdin. Example: echo "content" | node index.js save <url>');
      process.exit(1);
    }
    const result = save(url, content, { title });
    console.log(JSON.stringify(result, null, 2));
    
  } else if (cmd === 'get' && args[1]) {
    const url = args[1];
    const allowStale = !args.includes('--no-stale');
    const result = get(url, { allowStale });
    if (!result) {
      console.error('Not found in archive.');
      process.exit(1);
    }
    if (result.stale) console.error(`[STALE: archived ${result.ageHours}h ago]`);
    console.log(result.content);
    
  } else if (cmd === 'search' && args[1]) {
    const results = search(args.slice(1).join(' '));
    if (results.length === 0) {
      console.log('No matches found.');
    } else {
      for (const r of results.slice(0, 20)) {
        console.log(`${r.archivedAt}  ${r.url}  (${Math.round(r.size/1024)}KB)${r.title ? '  ' + r.title : ''}`);
      }
      if (results.length > 20) console.log(`... and ${results.length - 20} more`);
    }
    
  } else if (cmd === 'stats') {
    console.log(JSON.stringify(stats(), null, 2));
    
  } else if (cmd === 'prune') {
    const maxAge = parseInt(args[1]) || MAX_AGE_HOURS;
    const removed = prune(maxAge);
    console.log(`Pruned ${removed} entries older than ${maxAge}h.`);
    
  } else {
    console.log(`web-archive — Local web page cache with stale-serve fallback

Usage:
  echo "content" | node index.js save <url> [title]   Save URL content
  node index.js get <url> [--no-stale]                 Retrieve cached content
  node index.js search <query>                         Search archive by URL/title
  node index.js stats                                  Show archive statistics
  node index.js prune [maxAgeHours]                    Remove old entries

Environment:
  WEB_ARCHIVE_MAX_AGE_HOURS  Stale threshold (default: 168 = 7 days)
  WEB_ARCHIVE_MAX_ENTRIES    Max cached pages (default: 500)
  WEB_ARCHIVE_MAX_SIZE_KB    Max size per entry (default: 200KB)
`);
  }
}

// --- Exports ---
module.exports = { save, get, search, stats, prune };
