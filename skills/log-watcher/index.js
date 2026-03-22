#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ── Configuration ──
const DEFAULT_LOG_DIRS = [
  path.join(process.env.HOME || '/root', '.openclaw/agents/main/sessions'),
  path.join(process.env.HOME || '/root', '.openclaw/logs'),
  '/var/log',
];

const MAX_LINES = 500;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// ── CLI Parsing ──
function parseArgs(argv) {
  const args = argv.slice(2);
  const cmd = args[0] || 'help';
  const flags = {};
  const positional = [];

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--lines' || args[i] === '-n') {
      flags.lines = parseInt(args[++i], 10) || 20;
    } else if (args[i] === '--pattern' || args[i] === '-p') {
      flags.pattern = args[++i];
    } else if (args[i] === '--since') {
      flags.since = args[++i]; // e.g., "1h", "30m", "2d"
    } else if (args[i] === '--json') {
      flags.json = true;
    } else if (args[i] === '--dir' || args[i] === '-d') {
      flags.dir = args[++i];
    } else if (args[i] === '--ext') {
      flags.ext = args[++i]; // e.g., ".log,.jsonl"
    } else if (args[i] === '--level') {
      flags.level = args[++i]; // error, warn, info
    } else if (args[i] === '--context' || args[i] === '-C') {
      flags.context = parseInt(args[++i], 10) || 2;
    } else if (args[i] === '--max') {
      flags.max = parseInt(args[++i], 10) || 50;
    } else if (!args[i].startsWith('-')) {
      positional.push(args[i]);
    }
  }

  return { cmd, flags, positional };
}

// ── Time Parsing ──
function parseDuration(str) {
  if (!str) return 0;
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  const val = parseInt(match[1], 10);
  switch (match[2]) {
    case 's': return val * 1000;
    case 'm': return val * 60 * 1000;
    case 'h': return val * 3600 * 1000;
    case 'd': return val * 86400 * 1000;
    default: return 0;
  }
}

// ── Core: Tail ──
async function tail(filePath, lines = 20) {
  if (!fs.existsSync(filePath)) return { error: `File not found: ${filePath}` };
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_FILE_SIZE) return { error: `File too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB` };

  const content = fs.readFileSync(filePath, 'utf8');
  const allLines = content.split('\n');
  const result = allLines.slice(-Math.min(lines, MAX_LINES));
  return {
    file: filePath,
    total_lines: allLines.length,
    returned: result.length,
    lines: result,
  };
}

// ── Core: Search ──
async function search(targets, pattern, flags = {}) {
  const regex = new RegExp(pattern, 'i');
  const sinceMs = flags.since ? Date.now() - parseDuration(flags.since) : 0;
  const maxResults = flags.max || 50;
  const contextLines = flags.context || 0;
  const results = [];

  const files = resolveFiles(targets, flags);

  for (const filePath of files) {
    if (results.length >= maxResults) break;
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_FILE_SIZE) continue;
      if (sinceMs && stat.mtimeMs < sinceMs) continue;

      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (results.length >= maxResults) break;
        if (regex.test(lines[i])) {
          const entry = {
            file: filePath,
            line_number: i + 1,
            text: lines[i].substring(0, 500),
          };
          if (contextLines > 0) {
            entry.before = lines.slice(Math.max(0, i - contextLines), i).map(l => l.substring(0, 300));
            entry.after = lines.slice(i + 1, i + 1 + contextLines).map(l => l.substring(0, 300));
          }
          results.push(entry);
        }
      }
    } catch (e) {
      // skip unreadable files
    }
  }

  return {
    pattern,
    files_searched: files.length,
    matches: results.length,
    results,
  };
}

// ── Core: Errors ──
async function errors(targets, flags = {}) {
  const errorPatterns = [
    /\berror\b/i,
    /\bfailed\b/i,
    /\bexception\b/i,
    /\bcrash/i,
    /\bfatal\b/i,
    /\btimeout\b/i,
    /\bEACCES\b/,
    /\bENOENT\b/,
    /\bECONNREFUSED\b/,
    /\bstack trace/i,
  ];

  if (flags.level === 'warn') {
    errorPatterns.push(/\bwarn(?:ing)?\b/i);
  }

  const sinceMs = flags.since ? Date.now() - parseDuration(flags.since) : Date.now() - 3600000; // default 1h
  const maxResults = flags.max || 30;
  const files = resolveFiles(targets, flags);
  const results = [];

  for (const filePath of files) {
    if (results.length >= maxResults) break;
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_FILE_SIZE) continue;
      if (stat.mtimeMs < sinceMs) continue;

      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (results.length >= maxResults) break;
        const matched = errorPatterns.some(p => p.test(lines[i]));
        if (matched) {
          results.push({
            file: path.basename(filePath),
            line: i + 1,
            text: lines[i].substring(0, 400),
            severity: /\bfatal|crash/i.test(lines[i]) ? 'critical'
              : /\berror|exception|failed/i.test(lines[i]) ? 'error'
              : 'warning',
          });
        }
      }
    } catch (e) { /* skip */ }
  }

  // Group by severity
  const grouped = { critical: [], error: [], warning: [] };
  results.forEach(r => grouped[r.severity].push(r));

  return {
    since: flags.since || '1h',
    files_scanned: files.length,
    total_errors: results.length,
    by_severity: {
      critical: grouped.critical.length,
      error: grouped.error.length,
      warning: grouped.warning.length,
    },
    results: results.slice(0, maxResults),
  };
}

// ── Core: Stats ──
async function stats(targets, flags = {}) {
  const files = resolveFiles(targets, flags);
  const fileStats = [];
  let totalSize = 0;
  let totalLines = 0;

  for (const filePath of files) {
    try {
      const stat = fs.statSync(filePath);
      const lines = fs.readFileSync(filePath, 'utf8').split('\n').length;
      totalSize += stat.size;
      totalLines += lines;
      fileStats.push({
        file: path.basename(filePath),
        path: filePath,
        size: formatBytes(stat.size),
        lines,
        modified: new Date(stat.mtimeMs).toISOString(),
        age: formatAge(Date.now() - stat.mtimeMs),
      });
    } catch (e) { /* skip */ }
  }

  fileStats.sort((a, b) => b.lines - a.lines);

  return {
    total_files: fileStats.length,
    total_size: formatBytes(totalSize),
    total_lines: totalLines,
    files: fileStats.slice(0, flags.max || 20),
  };
}

// ── Core: Recent ──
async function recent(targets, flags = {}) {
  const n = flags.lines || 10;
  const sinceMs = flags.since ? Date.now() - parseDuration(flags.since) : Date.now() - 86400000;
  const files = resolveFiles(targets, flags);

  // Sort by mtime desc, take top N
  const withStats = [];
  for (const f of files) {
    try {
      const stat = fs.statSync(f);
      if (stat.mtimeMs >= sinceMs) {
        withStats.push({ file: f, mtime: stat.mtimeMs, size: stat.size });
      }
    } catch (e) { /* skip */ }
  }
  withStats.sort((a, b) => b.mtime - a.mtime);

  return {
    since: flags.since || '24h',
    total: withStats.length,
    recent: withStats.slice(0, n).map(f => ({
      file: path.basename(f.file),
      path: f.file,
      modified: new Date(f.mtime).toISOString(),
      age: formatAge(Date.now() - f.mtime),
      size: formatBytes(f.size),
    })),
  };
}

// ── Core: JSONL Parse ──
async function jsonl(filePath, flags = {}) {
  if (!fs.existsSync(filePath)) return { error: `File not found: ${filePath}` };

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  const n = flags.lines || 10;
  const selectedLines = lines.slice(-n);
  const parsed = [];

  for (const line of selectedLines) {
    try {
      const obj = JSON.parse(line);
      if (flags.pattern) {
        const regex = new RegExp(flags.pattern, 'i');
        if (!regex.test(line)) continue;
      }
      parsed.push(obj);
    } catch (e) {
      parsed.push({ _raw: line.substring(0, 300), _parseError: true });
    }
  }

  return {
    file: filePath,
    total_lines: lines.length,
    returned: parsed.length,
    entries: parsed,
  };
}

// ── Helpers ──
function resolveFiles(targets, flags = {}) {
  const dirs = targets.length ? targets : (flags.dir ? [flags.dir] : DEFAULT_LOG_DIRS);
  const exts = flags.ext ? flags.ext.split(',') : ['.log', '.jsonl', '.txt'];
  const files = [];

  for (const target of dirs) {
    try {
      const stat = fs.statSync(target);
      if (stat.isFile()) {
        files.push(target);
      } else if (stat.isDirectory()) {
        // One level deep scan
        const entries = fs.readdirSync(target);
        for (const entry of entries) {
          const fullPath = path.join(target, entry);
          try {
            const s = fs.statSync(fullPath);
            if (s.isFile() && exts.some(e => entry.endsWith(e))) {
              files.push(fullPath);
            }
          } catch (e) { /* skip */ }
        }
      }
    } catch (e) { /* skip */ }
  }

  return files;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1024 / 1024).toFixed(1) + 'MB';
}

function formatAge(ms) {
  if (ms < 60000) return Math.round(ms / 1000) + 's ago';
  if (ms < 3600000) return Math.round(ms / 60000) + 'm ago';
  if (ms < 86400000) return (ms / 3600000).toFixed(1) + 'h ago';
  return (ms / 86400000).toFixed(1) + 'd ago';
}

function printResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    // Human-readable output
    if (result.error) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
    console.log(JSON.stringify(result, null, 2));
  }
}

// ── Main ──
async function main() {
  const { cmd, flags, positional } = parseArgs(process.argv);

  let result;
  switch (cmd) {
    case 'tail':
      if (!positional[0]) { console.error('Usage: log-watcher tail <file> [--lines N]'); process.exit(1); }
      result = await tail(positional[0], flags.lines || 20);
      break;

    case 'search':
      if (!flags.pattern && !positional[1]) { console.error('Usage: log-watcher search [dir...] --pattern <regex>'); process.exit(1); }
      result = await search(positional, flags.pattern || positional.pop(), flags);
      break;

    case 'errors':
      result = await errors(positional, flags);
      break;

    case 'stats':
      result = await stats(positional, flags);
      break;

    case 'recent':
      result = await recent(positional, flags);
      break;

    case 'jsonl':
      if (!positional[0]) { console.error('Usage: log-watcher jsonl <file> [--lines N] [--pattern <regex>]'); process.exit(1); }
      result = await jsonl(positional[0], flags);
      break;

    case 'help':
    default:
      console.log(`log-watcher - Replace repeated exec grep/tail/cat with one call

Commands:
  tail <file> [--lines N]         Tail a log file (default 20 lines)
  search [dirs...] -p <pattern>   Search across log files
  errors [dirs...] [--since 1h]   Find errors/exceptions in logs
  stats [dirs...]                 File stats (size, lines, age)
  recent [dirs...] [--since 24h]  Recently modified log files
  jsonl <file> [--lines N]        Parse JSONL (session logs, events)

Options:
  --lines, -n N     Number of lines
  --pattern, -p P   Search pattern (regex)
  --since T         Time filter: 30m, 1h, 2d, etc.
  --json            JSON output
  --dir, -d DIR     Target directory
  --ext E           File extensions (.log,.jsonl)
  --level L         error|warn (for errors command)
  --context, -C N   Context lines around matches
  --max N           Max results`);
      return;
  }

  printResult(result, flags.json);
}

// ── Exports (for programmatic use) ──
module.exports = { tail, search, errors, stats, recent, jsonl };

// ── Run if called directly ──
if (require.main === module) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
