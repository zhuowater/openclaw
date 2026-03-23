#!/usr/bin/env node
'use strict';

/**
 * page-diff — Monitor web pages for content changes.
 *
 * Stores text snapshots of URLs and diffs them to detect changes.
 * Useful for tracking CVE pages, release notes, API docs, pricing pages, etc.
 *
 * Usage:
 *   node index.js add <url> [--name <label>] [--selector <css>]
 *   node index.js check [<name-or-url>] [--quiet]
 *   node index.js list
 *   node index.js diff <name-or-url>
 *   node index.js remove <name-or-url>
 *   node index.js history <name-or-url> [--limit N]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const DATA_DIR = path.join(__dirname, 'data');
const TARGETS_FILE = path.join(DATA_DIR, 'targets.json');
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');

// Ensure data dirs exist
function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

// Load targets
function loadTargets() {
  ensureDirs();
  if (!fs.existsSync(TARGETS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf8')); }
  catch { return {}; }
}

// Save targets
function saveTargets(targets) {
  ensureDirs();
  fs.writeFileSync(TARGETS_FILE, JSON.stringify(targets, null, 2));
}

// Hash content
function hashContent(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

// Fetch URL content as text (uses curl, strips HTML tags for simple diff)
function fetchPage(url) {
  try {
    const html = execSync(
      `curl -sL --max-time 30 --retry 2 ${JSON.stringify(url)}`,
      { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 }
    );
    // Strip HTML to get readable text for diffing
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#\d+;/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  } catch (err) {
    throw new Error(`Failed to fetch ${url}: ${err.message}`);
  }
}

// Save a snapshot
function saveSnapshot(name, content, hash) {
  const dir = path.join(SNAPSHOTS_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${ts}_${hash}.txt`);
  fs.writeFileSync(file, content);
  return file;
}

// Get sorted snapshot files for a target
function getSnapshots(name) {
  const dir = path.join(SNAPSHOTS_DIR, name);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.txt'))
    .sort()
    .map(f => path.join(dir, f));
}

// Simple line diff (returns changed lines)
function simpleDiff(oldText, newText) {
  const oldLines = oldText.split(/(?<=\.\s)|(?<=\n)/).filter(Boolean);
  const newLines = newText.split(/(?<=\.\s)|(?<=\n)/).filter(Boolean);
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  const added = newLines.filter(l => !oldSet.has(l));
  const removed = oldLines.filter(l => !newSet.has(l));
  return { added, removed };
}

// Resolve name or URL to target key
function resolveTarget(targets, query) {
  // Direct name match
  if (targets[query]) return query;
  // URL match
  for (const [name, t] of Object.entries(targets)) {
    if (t.url === query) return name;
  }
  // Partial name match
  for (const name of Object.keys(targets)) {
    if (name.includes(query)) return name;
  }
  return null;
}

// === Commands ===

function cmdAdd(args) {
  const url = args[0];
  if (!url || !url.startsWith('http')) {
    console.error('Usage: page-diff add <url> [--name <label>]');
    process.exit(1);
  }
  const nameIdx = args.indexOf('--name');
  const name = nameIdx >= 0 && args[nameIdx + 1]
    ? args[nameIdx + 1]
    : url.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 60);

  const targets = loadTargets();
  if (targets[name]) {
    console.log(`Target "${name}" already exists. Use 'remove' first to re-add.`);
    return;
  }

  console.log(`Fetching initial snapshot of ${url}...`);
  const content = fetchPage(url);
  const hash = hashContent(content);
  const snapFile = saveSnapshot(name, content, hash);

  targets[name] = {
    url,
    name,
    added_at: new Date().toISOString(),
    last_check: new Date().toISOString(),
    last_hash: hash,
    check_count: 1,
    change_count: 0
  };
  saveTargets(targets);
  console.log(`✅ Added "${name}" — initial hash: ${hash} (${content.length} chars)`);
}

function cmdCheck(args) {
  const targets = loadTargets();
  const quiet = args.includes('--quiet');
  const query = args.filter(a => !a.startsWith('--'))[0];

  const toCheck = query
    ? (() => {
        const key = resolveTarget(targets, query);
        if (!key) { console.error(`Target not found: ${query}`); process.exit(1); }
        return { [key]: targets[key] };
      })()
    : targets;

  if (Object.keys(toCheck).length === 0) {
    console.log('No targets configured. Use "add" first.');
    return;
  }

  const results = [];
  for (const [name, target] of Object.entries(toCheck)) {
    try {
      const content = fetchPage(target.url);
      const hash = hashContent(content);
      const changed = hash !== target.last_hash;

      if (changed) {
        saveSnapshot(name, content, hash);
        target.change_count = (target.change_count || 0) + 1;
      }

      const prevHash = target.last_hash;
      target.last_check = new Date().toISOString();
      target.last_hash = hash;
      target.check_count = (target.check_count || 0) + 1;

      results.push({
        name,
        url: target.url,
        changed,
        prevHash,
        newHash: hash,
        chars: content.length
      });

      if (!quiet) {
        const icon = changed ? '🔴 CHANGED' : '✅ No change';
        console.log(`${icon}  ${name} (${hash})`);
      }
    } catch (err) {
      results.push({ name, url: target.url, error: err.message });
      if (!quiet) console.log(`⚠️  ${name}: ${err.message}`);
    }
  }

  saveTargets(targets);

  const changed = results.filter(r => r.changed);
  if (quiet && changed.length > 0) {
    console.log(JSON.stringify({ changed, total: results.length }));
  } else if (quiet && changed.length === 0) {
    // silent when nothing changed in quiet mode
  }

  return results;
}

function cmdList() {
  const targets = loadTargets();
  const entries = Object.entries(targets);
  if (entries.length === 0) {
    console.log('No targets configured. Use "add" to start monitoring.');
    return;
  }
  console.log(`\n📋 Monitored Pages (${entries.length}):\n`);
  for (const [name, t] of entries) {
    const snapCount = getSnapshots(name).length;
    console.log(`  ${name}`);
    console.log(`    URL: ${t.url}`);
    console.log(`    Last check: ${t.last_check || 'never'}`);
    console.log(`    Changes detected: ${t.change_count || 0} / ${t.check_count || 0} checks`);
    console.log(`    Snapshots: ${snapCount}`);
    console.log('');
  }
}

function cmdDiff(args) {
  const query = args[0];
  if (!query) { console.error('Usage: page-diff diff <name-or-url>'); process.exit(1); }

  const targets = loadTargets();
  const key = resolveTarget(targets, query);
  if (!key) { console.error(`Target not found: ${query}`); process.exit(1); }

  const snaps = getSnapshots(key);
  if (snaps.length < 2) {
    console.log(`Only ${snaps.length} snapshot(s) for "${key}". Need at least 2 for diff.`);
    return;
  }

  const prev = fs.readFileSync(snaps[snaps.length - 2], 'utf8');
  const curr = fs.readFileSync(snaps[snaps.length - 1], 'utf8');
  const { added, removed } = simpleDiff(prev, curr);

  console.log(`\n📊 Diff for "${key}" (last 2 snapshots):\n`);
  if (added.length === 0 && removed.length === 0) {
    console.log('  No differences found.');
    return;
  }
  if (removed.length > 0) {
    console.log(`  ➖ Removed (${removed.length} segments):`);
    removed.slice(0, 20).forEach(l => console.log(`    - ${l.trim().slice(0, 200)}`));
    if (removed.length > 20) console.log(`    ... and ${removed.length - 20} more`);
  }
  if (added.length > 0) {
    console.log(`  ➕ Added (${added.length} segments):`);
    added.slice(0, 20).forEach(l => console.log(`    + ${l.trim().slice(0, 200)}`));
    if (added.length > 20) console.log(`    ... and ${added.length - 20} more`);
  }
}

function cmdRemove(args) {
  const query = args[0];
  if (!query) { console.error('Usage: page-diff remove <name-or-url>'); process.exit(1); }

  const targets = loadTargets();
  const key = resolveTarget(targets, query);
  if (!key) { console.error(`Target not found: ${query}`); process.exit(1); }

  delete targets[key];
  saveTargets(targets);

  // Clean up snapshots
  const dir = path.join(SNAPSHOTS_DIR, key);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
  console.log(`✅ Removed "${key}" and its snapshots.`);
}

function cmdHistory(args) {
  const query = args.filter(a => !a.startsWith('--'))[0];
  if (!query) { console.error('Usage: page-diff history <name-or-url>'); process.exit(1); }

  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) || 10 : 10;

  const targets = loadTargets();
  const key = resolveTarget(targets, query);
  if (!key) { console.error(`Target not found: ${query}`); process.exit(1); }

  const snaps = getSnapshots(key);
  console.log(`\n📜 History for "${key}" (${snaps.length} snapshots):\n`);

  const shown = snaps.slice(-limit);
  for (const snap of shown) {
    const basename = path.basename(snap, '.txt');
    const parts = basename.split('_');
    const hash = parts.pop();
    const ts = parts.join('_').replace(/-/g, (m, i) => i < 10 ? '-' : i === 10 ? 'T' : i < 16 ? ':' : '.');
    const size = fs.statSync(snap).size;
    console.log(`  ${ts}  hash=${hash}  size=${size}B`);
  }
}

// Main entry & exports
function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const rest = args.slice(1);

  switch (cmd) {
    case 'add': return cmdAdd(rest);
    case 'check': return cmdCheck(rest);
    case 'list': return cmdList();
    case 'diff': return cmdDiff(rest);
    case 'remove': return cmdRemove(rest);
    case 'history': return cmdHistory(rest);
    default:
      console.log('page-diff — Monitor web pages for content changes\n');
      console.log('Commands:');
      console.log('  add <url> [--name <label>]   Add a page to monitor');
      console.log('  check [<name>] [--quiet]     Check for changes');
      console.log('  list                         List monitored pages');
      console.log('  diff <name>                  Show diff of last change');
      console.log('  remove <name>                Remove a monitored page');
      console.log('  history <name> [--limit N]   Show snapshot history');
  }
}

module.exports = { main, cmdAdd, cmdCheck, cmdList, cmdDiff, cmdRemove, cmdHistory, fetchPage, loadTargets, resolveTarget };

if (require.main === module) main();
