#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// --- Config ---
const MEMORY_DIR = process.env.MEMORY_DIR || path.resolve(__dirname, '../../memory');
const EVOLUTION_DIR = path.join(MEMORY_DIR, 'evolution');
const KEEP_PROMPTS = parseInt(process.env.JANITOR_KEEP_PROMPTS || '3', 10);
const KEEP_GRAPH_LINES = parseInt(process.env.JANITOR_KEEP_GRAPH_LINES || '500', 10);
const ARCHIVE_DAYS = parseInt(process.env.JANITOR_ARCHIVE_DAYS || '14', 10);
const DRY_RUN = process.env.JANITOR_DRY_RUN === 'true' || process.argv.includes('--dry-run');
const STATS_ONLY = process.argv.includes('--stats-only');
const ARCHIVE_ONLY = process.argv.includes('--archive-daily');
const DISK_CLEAN = process.argv.includes('--disk');
const DEDUP_CANDIDATES = process.argv.includes('--dedup-candidates');
const SESSION_CLEAN = process.argv.includes('--sessions');
const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../..');
const EVOLVER_ASSETS = path.join(WORKSPACE, 'skills', 'evolver', 'assets', 'gep');

// Session archive config
const os = require('os');
const AGENT_NAME = process.env.AGENT_NAME || 'main';
const SESSIONS_ARCHIVE_DIR = path.join(os.homedir(), `.openclaw/agents/${AGENT_NAME}/sessions/archive`);
const SESSION_ARCHIVE_MAX_AGE_DAYS = parseInt(process.env.JANITOR_SESSION_MAX_DAYS || '7', 10);
const SESSION_ARCHIVE_MAX_COUNT = parseInt(process.env.JANITOR_SESSION_MAX_COUNT || '200', 10);

// Protected files that must never be deleted
const PROTECTED_ROOTS = new Set([
  'MEMORY.md', 'SOUL.md', 'IDENTITY.md', 'AGENTS.md',
  'USER.md', 'HEARTBEAT.md', 'TOOLS.md', 'BOOTSTRAP.md',
  'RECENT_EVENTS.md'
]);

// --- Helpers ---
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getDirSize(dirPath) {
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isFile()) {
        total += fs.statSync(fullPath).size;
      } else if (entry.isDirectory()) {
        total += getDirSize(fullPath);
      }
    }
  } catch (e) { /* ignore */ }
  return total;
}

function getFilesByPattern(dir, pattern) {
  try {
    return fs.readdirSync(dir)
      .filter(f => pattern.test(f))
      .map(f => ({
        name: f,
        path: path.join(dir, f),
        stat: fs.statSync(path.join(dir, f))
      }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs); // newest first
  } catch (e) {
    return [];
  }
}

// --- Stats ---
function collectStats() {
  const stats = {
    totalSize: 0,
    categories: {},
    details: []
  };

  // Memory root files
  try {
    const rootFiles = fs.readdirSync(MEMORY_DIR, { withFileTypes: true });
    let rootSize = 0;
    let rootCount = 0;
    for (const entry of rootFiles) {
      if (entry.isFile()) {
        const s = fs.statSync(path.join(MEMORY_DIR, entry.name));
        rootSize += s.size;
        rootCount++;
      }
    }
    stats.categories['daily-notes'] = { count: rootCount, size: rootSize };
    stats.totalSize += rootSize;
  } catch (e) { /* ignore */ }

  // Evolution dir
  if (fs.existsSync(EVOLUTION_DIR)) {
    const evoFiles = fs.readdirSync(EVOLUTION_DIR, { withFileTypes: true });
    let promptSize = 0, promptCount = 0;
    let graphSize = 0, graphLines = 0;
    let otherSize = 0, otherCount = 0;

    for (const entry of evoFiles) {
      if (!entry.isFile()) continue;
      const fp = path.join(EVOLUTION_DIR, entry.name);
      const s = fs.statSync(fp);

      if (/^gep_prompt_/.test(entry.name)) {
        promptSize += s.size;
        promptCount++;
      } else if (entry.name === 'memory_graph.jsonl') {
        graphSize = s.size;
        try {
          graphLines = fs.readFileSync(fp, 'utf8').split('\n').filter(l => l.trim()).length;
        } catch (e) { /* ignore */ }
      } else {
        otherSize += s.size;
        otherCount++;
      }
    }

    stats.categories['gep-prompts'] = { count: promptCount, size: promptSize };
    stats.categories['memory-graph'] = { lines: graphLines, size: graphSize };
    stats.categories['evolution-other'] = { count: otherCount, size: otherSize };
    stats.totalSize += promptSize + graphSize + otherSize;
  }

  // Archive files
  try {
    const archiveFiles = fs.readdirSync(MEMORY_DIR)
      .filter(f => f.startsWith('archive-'));
    let archiveSize = 0;
    for (const f of archiveFiles) {
      archiveSize += fs.statSync(path.join(MEMORY_DIR, f)).size;
    }
    stats.categories['archives'] = { count: archiveFiles.length, size: archiveSize };
  } catch (e) { /* ignore */ }

  return stats;
}

// --- Cleanup: GEP Prompts ---
function cleanGepPrompts() {
  const prompts = getFilesByPattern(EVOLUTION_DIR, /^gep_prompt_.*\.txt$/);
  const toDelete = prompts.slice(KEEP_PROMPTS);
  let freedBytes = 0;

  for (const file of toDelete) {
    freedBytes += file.stat.size;
    if (!DRY_RUN) {
      fs.unlinkSync(file.path);
    }
  }

  return {
    total: prompts.length,
    deleted: toDelete.length,
    kept: Math.min(prompts.length, KEEP_PROMPTS),
    freedBytes,
    deletedFiles: toDelete.map(f => f.name)
  };
}

// --- Cleanup: Memory Graph Compaction ---
function compactMemoryGraph() {
  const graphPath = path.join(EVOLUTION_DIR, 'memory_graph.jsonl');
  if (!fs.existsSync(graphPath)) {
    return { skipped: true, reason: 'file not found' };
  }

  const content = fs.readFileSync(graphPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  const originalLines = lines.length;
  const originalSize = Buffer.byteLength(content);

  if (originalLines <= KEEP_GRAPH_LINES) {
    return {
      skipped: true,
      reason: `${originalLines} lines ≤ limit ${KEEP_GRAPH_LINES}`,
      originalLines,
      originalSize
    };
  }

  // Keep the most recent lines
  const keptLines = lines.slice(-KEEP_GRAPH_LINES);
  const newContent = keptLines.join('\n') + '\n';
  const newSize = Buffer.byteLength(newContent);

  if (!DRY_RUN) {
    fs.writeFileSync(graphPath, newContent);
  }

  return {
    skipped: false,
    originalLines,
    newLines: keptLines.length,
    removedLines: originalLines - keptLines.length,
    originalSize,
    newSize,
    freedBytes: originalSize - newSize
  };
}

// --- Cleanup: Archive Old Daily Notes ---
function archiveDailyNotes() {
  const DAILY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:-.*)?\.md$/;
  const now = Date.now();
  const cutoff = now - ARCHIVE_DAYS * 86400000;

  let files;
  try {
    files = fs.readdirSync(MEMORY_DIR, { withFileTypes: true })
      .filter(e => e.isFile() && DAILY_PATTERN.test(e.name))
      .map(e => {
        const m = e.name.match(DAILY_PATTERN);
        const dateStr = `${m[1]}-${m[2]}-${m[3]}`;
        const month = `${m[1]}-${m[2]}`;
        const fp = path.join(MEMORY_DIR, e.name);
        const stat = fs.statSync(fp);
        return { name: e.name, path: fp, dateStr, month, stat, ts: new Date(dateStr).getTime() };
      })
      .filter(f => !isNaN(f.ts) && f.ts < cutoff)
      .sort((a, b) => a.ts - b.ts);
  } catch (e) {
    return { skipped: true, reason: e.message };
  }

  if (files.length === 0) {
    return { skipped: true, reason: `no daily notes older than ${ARCHIVE_DAYS} days` };
  }

  // Group by month
  const byMonth = {};
  for (const f of files) {
    (byMonth[f.month] = byMonth[f.month] || []).push(f);
  }

  const archived = [];
  let freedBytes = 0;

  for (const [month, monthFiles] of Object.entries(byMonth)) {
    const archivePath = path.join(MEMORY_DIR, `archive-daily-${month}.md`);
    const header = `# Daily Notes Archive: ${month}\n\n*Archived by memory-janitor on ${new Date().toISOString().slice(0, 10)}*\n\n---\n\n`;

    let body = '';
    for (const f of monthFiles) {
      const content = fs.readFileSync(f.path, 'utf8');
      body += `## ${f.dateStr} (${f.name})\n\n${content}\n\n---\n\n`;
    }

    if (!DRY_RUN) {
      // Append to existing archive or create new one
      if (fs.existsSync(archivePath)) {
        fs.appendFileSync(archivePath, '\n' + body);
      } else {
        fs.writeFileSync(archivePath, header + body);
      }
      // Remove originals
      for (const f of monthFiles) {
        freedBytes += f.stat.size;
        fs.unlinkSync(f.path);
      }
    } else {
      for (const f of monthFiles) {
        freedBytes += f.stat.size;
      }
    }

    archived.push({ month, files: monthFiles.map(f => f.name), archivePath: path.basename(archivePath) });
  }

  return {
    skipped: false,
    totalFiles: files.length,
    months: Object.keys(byMonth).length,
    archived,
    freedBytes
  };
}

// --- Cleanup: GEP Prompt JSON artifacts ---
function cleanGepPromptJsons() {
  const jsonPrompts = getFilesByPattern(EVOLUTION_DIR, /^gep_prompt_.*\.json$/);
  const toDelete = jsonPrompts.slice(KEEP_PROMPTS);
  let freedBytes = 0;

  for (const file of toDelete) {
    freedBytes += file.stat.size;
    if (!DRY_RUN) {
      fs.unlinkSync(file.path);
    }
  }

  return {
    total: jsonPrompts.length,
    deleted: toDelete.length,
    kept: Math.min(jsonPrompts.length, KEEP_PROMPTS),
    freedBytes,
    deletedFiles: toDelete.map(f => f.name)
  };
}

// --- Cleanup: GEP candidates.jsonl Deduplication ---
function deduplicateCandidates() {
  const candidatesPath = path.join(EVOLVER_ASSETS, 'candidates.jsonl');
  if (!fs.existsSync(candidatesPath)) {
    return { skipped: true, reason: 'candidates.jsonl not found' };
  }

  const content = fs.readFileSync(candidatesPath, 'utf8');
  const originalSize = Buffer.byteLength(content);
  const lines = content.split('\n').filter(l => l.trim());
  const originalCount = lines.length;

  if (originalCount <= 100) {
    return { skipped: true, reason: `only ${originalCount} entries, no dedup needed`, originalCount, originalSize };
  }

  // Deduplicate by id, keeping the LATEST entry for each id
  const seen = new Map(); // id → { line, index }
  for (let i = 0; i < lines.length; i++) {
    try {
      const obj = JSON.parse(lines[i]);
      const id = obj.id || `anon_${i}`;
      seen.set(id, { line: lines[i], index: i });
    } catch (e) {
      // Keep unparseable lines (append at end)
      seen.set(`_unparseable_${i}`, { line: lines[i], index: i });
    }
  }

  const deduped = Array.from(seen.values())
    .sort((a, b) => a.index - b.index)
    .map(v => v.line);

  const newCount = deduped.length;
  const removedCount = originalCount - newCount;

  if (removedCount === 0) {
    return { skipped: true, reason: 'no duplicates found', originalCount, originalSize };
  }

  const newContent = deduped.join('\n') + '\n';
  const newSize = Buffer.byteLength(newContent);
  const freedBytes = originalSize - newSize;

  if (!DRY_RUN) {
    // Write backup first
    const backupPath = candidatesPath + '.bak';
    fs.writeFileSync(backupPath, content);
    fs.writeFileSync(candidatesPath, newContent);
  }

  return {
    skipped: false,
    originalCount,
    newCount,
    removedCount,
    originalSize,
    newSize,
    freedBytes,
    compressionRatio: ((1 - newSize / originalSize) * 100).toFixed(1) + '%'
  };
}

// --- Disk Cleanup ---
const { execSync } = require('child_process');

function cleanNpmCache() {
  const npmDir = path.join(process.env.HOME || '/root', '.npm');
  if (!fs.existsSync(npmDir)) return { skipped: true, reason: 'no .npm directory' };

  let size = 0;
  try {
    const output = execSync(`du -sb ${npmDir} 2>/dev/null`, { encoding: 'utf8' }).trim();
    size = parseInt(output.split('\t')[0], 10) || 0;
  } catch (e) { /* ignore */ }

  if (size < 1024 * 1024) return { skipped: true, reason: `cache only ${formatBytes(size)}` };

  if (!DRY_RUN) {
    try { execSync('npm cache clean --force 2>/dev/null'); } catch (e) { /* ignore */ }
  }

  return { skipped: false, freedBytes: size, description: `npm cache (${formatBytes(size)})` };
}

function cleanPycache() {
  const skillsDir = path.join(WORKSPACE, 'skills');
  if (!fs.existsSync(skillsDir)) return { skipped: true, reason: 'no skills directory' };

  let freedBytes = 0;
  let count = 0;

  function removePycache(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === '__pycache__') {
            const size = getDirSize(full);
            freedBytes += size;
            count++;
            if (!DRY_RUN) {
              fs.rmSync(full, { recursive: true, force: true });
            }
          } else if (e.name !== 'node_modules' && e.name !== '.git' && e.name !== 'venv') {
            removePycache(full);
          }
        }
      }
    } catch (e) { /* ignore */ }
  }

  removePycache(skillsDir);
  if (count === 0) return { skipped: true, reason: 'no __pycache__ found' };
  return { skipped: false, freedBytes, count, description: `${count} __pycache__ dirs (${formatBytes(freedBytes)})` };
}

function cleanJournalLogs() {
  let currentSize = 0;
  try {
    const output = execSync('journalctl --disk-usage 2>/dev/null', { encoding: 'utf8' });
    const m = output.match(/([\d.]+)([KMGT])/i);
    if (m) {
      const val = parseFloat(m[1]);
      const unit = m[2].toUpperCase();
      const mult = { K: 1024, M: 1024**2, G: 1024**3, T: 1024**4 };
      currentSize = val * (mult[unit] || 1);
    }
  } catch (e) { return { skipped: true, reason: 'journalctl not available' }; }

  const targetSize = 50 * 1024 * 1024; // keep 50MB
  if (currentSize <= targetSize) return { skipped: true, reason: `journal only ${formatBytes(currentSize)}` };

  const freedEstimate = currentSize - targetSize;
  if (!DRY_RUN) {
    try { execSync('journalctl --vacuum-size=50M 2>/dev/null'); } catch (e) { /* ignore */ }
  }

  return { skipped: false, freedBytes: freedEstimate, description: `journal logs (${formatBytes(freedEstimate)} est.)` };
}

function cleanStaleLogs() {
  const logDirs = [
    path.join(WORKSPACE, 'skills/intelligence/logs'),
  ];
  let freedBytes = 0;
  let count = 0;
  const maxAge = 7 * 86400000; // 7 days

  for (const dir of logDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.log'));
      for (const f of files) {
        const fp = path.join(dir, f);
        const st = fs.statSync(fp);
        if (Date.now() - st.mtimeMs > maxAge) {
          freedBytes += st.size;
          count++;
          if (!DRY_RUN) fs.unlinkSync(fp);
        }
      }
    } catch (e) { /* ignore */ }
  }

  if (count === 0) return { skipped: true, reason: 'no stale logs' };
  return { skipped: false, freedBytes, count, description: `${count} stale log files (${formatBytes(freedBytes)})` };
}

function cleanSessionArchives() {
  if (!fs.existsSync(SESSIONS_ARCHIVE_DIR)) {
    return { skipped: true, reason: 'archive dir not found' };
  }

  const files = fs.readdirSync(SESSIONS_ARCHIVE_DIR)
    .filter(f => f.endsWith('.jsonl') || f.endsWith('.json'))
    .map(f => {
      const fullPath = path.join(SESSIONS_ARCHIVE_DIR, f);
      const stat = fs.statSync(fullPath);
      return { name: f, path: fullPath, size: stat.size, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs); // newest first

  if (files.length === 0) {
    return { skipped: true, reason: 'no archived sessions' };
  }

  const now = Date.now();
  const maxAgeMs = SESSION_ARCHIVE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  // Delete files that are both: older than max age AND beyond max count
  const toDelete = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const isOld = (now - file.mtimeMs) > maxAgeMs;
    const isBeyondCount = i >= SESSION_ARCHIVE_MAX_COUNT;
    if (isOld || isBeyondCount) {
      toDelete.push(file);
    }
  }

  if (toDelete.length === 0) {
    return {
      skipped: true,
      reason: `all ${files.length} files within limits (max ${SESSION_ARCHIVE_MAX_COUNT} files, ${SESSION_ARCHIVE_MAX_AGE_DAYS} days)`
    };
  }

  let freedBytes = 0;
  const deleted = [];
  for (const file of toDelete) {
    if (!DRY_RUN) {
      try {
        fs.unlinkSync(file.path);
        freedBytes += file.size;
        deleted.push(file.name);
      } catch (e) {
        console.error(`    Failed to delete ${file.name}: ${e.message}`);
      }
    } else {
      freedBytes += file.size;
      deleted.push(file.name);
    }
  }

  return {
    action: 'clean_session_archives',
    total: files.length,
    deleted: deleted.length,
    remaining: files.length - deleted.length,
    freedBytes,
    deletedFiles: deleted.slice(0, 10), // only show first 10
    dryRun: DRY_RUN
  };
}

function diskCleanup() {
  console.log('🧹 Disk Cleanup:');
  console.log('');
  const results = [];

  // 1. npm cache
  console.log('  [npm cache]');
  const npm = cleanNpmCache();
  if (npm.skipped) console.log(`    Skipped: ${npm.reason}`);
  else { console.log(`    ${DRY_RUN ? 'Would clean' : 'Cleaned'}: ${npm.description}`); results.push(npm); }

  // 2. __pycache__ (outside venvs)
  console.log('  [__pycache__]');
  const pyc = cleanPycache();
  if (pyc.skipped) console.log(`    Skipped: ${pyc.reason}`);
  else { console.log(`    ${DRY_RUN ? 'Would clean' : 'Cleaned'}: ${pyc.description}`); results.push(pyc); }

  // 3. journal logs
  console.log('  [journal logs]');
  const journal = cleanJournalLogs();
  if (journal.skipped) console.log(`    Skipped: ${journal.reason}`);
  else { console.log(`    ${DRY_RUN ? 'Would clean' : 'Cleaned'}: ${journal.description}`); results.push(journal); }

  // 4. stale skill logs
  console.log('  [stale skill logs]');
  const logs = cleanStaleLogs();
  if (logs.skipped) console.log(`    Skipped: ${logs.reason}`);
  else { console.log(`    ${DRY_RUN ? 'Would clean' : 'Cleaned'}: ${logs.description}`); results.push(logs); }

  const totalFreed = results.reduce((s, r) => s + (r.freedBytes || 0), 0);
  console.log('');
  console.log(`  ${DRY_RUN ? 'Would free' : 'Freed'} total: ${formatBytes(totalFreed)}`);
  return { actions: results, totalFreed };
}

// --- Main ---
function main() {
  console.log('=== Memory Janitor ===');
  console.log(`Mode: ${STATS_ONLY ? 'stats-only' : DRY_RUN ? 'dry-run' : 'cleanup'}`);
  console.log(`Memory dir: ${MEMORY_DIR}`);
  console.log('');

  // Always show stats
  const stats = collectStats();
  console.log('📊 Memory Stats:');
  console.log(`  Total size: ${formatBytes(stats.totalSize)}`);
  for (const [cat, info] of Object.entries(stats.categories)) {
    const countStr = info.count !== undefined ? `${info.count} files` : `${info.lines} lines`;
    console.log(`  ${cat}: ${countStr}, ${formatBytes(info.size)}`);
  }
  console.log('');

  if (STATS_ONLY) {
    return { stats, actions: [] };
  }

  const actions = [];

  // Handle --archive-daily shortcut
  if (ARCHIVE_ONLY) {
    console.log(`📦 Archive Daily Notes (older than ${ARCHIVE_DAYS} days):`);
    const archResult = archiveDailyNotes();
    if (archResult.skipped) {
      console.log(`  Skipped: ${archResult.reason}`);
    } else {
      console.log(`  Archived ${archResult.totalFiles} files into ${archResult.months} monthly archives`);
      for (const a of archResult.archived) {
        console.log(`  ${a.month}: ${a.files.length} files → ${a.archivePath}`);
      }
      console.log(`  Freed: ${formatBytes(archResult.freedBytes)}`);
    }
    return { stats, actions: [{ action: 'archive_daily', ...archResult }] };
  }

  // Handle --disk mode
  if (DISK_CLEAN) {
    const diskResult = diskCleanup();
    return { stats, actions: diskResult.actions, totalFreed: diskResult.totalFreed, dryRun: DRY_RUN };
  }

  // Handle --dedup-candidates shortcut
  if (DEDUP_CANDIDATES) {
    console.log('🔧 GEP Candidates Deduplication:');
    const dedupResult = deduplicateCandidates();
    if (dedupResult.skipped) {
      console.log(`  Skipped: ${dedupResult.reason}`);
    } else {
      console.log(`  Deduped: ${dedupResult.originalCount} → ${dedupResult.newCount} entries (${dedupResult.compressionRatio} reduction)`);
      console.log(`  Freed: ${formatBytes(dedupResult.freedBytes)} (${formatBytes(dedupResult.originalSize)} → ${formatBytes(dedupResult.newSize)})`);
    }
    return { stats, actions: [{ action: 'dedup_candidates', ...dedupResult }], dryRun: DRY_RUN };
  }

  // Handle --sessions shortcut
  if (SESSION_CLEAN) {
    console.log(`🗂️ Session Archive Cleanup (max ${SESSION_ARCHIVE_MAX_COUNT} files, ${SESSION_ARCHIVE_MAX_AGE_DAYS} days):`);
    const sessResult = cleanSessionArchives();
    if (sessResult.skipped) {
      console.log(`  Skipped: ${sessResult.reason}`);
    } else {
      console.log(`  Deleted ${sessResult.deleted} of ${sessResult.total} sessions (freed ${formatBytes(sessResult.freedBytes)})`);
      console.log(`  Remaining: ${sessResult.remaining} sessions`);
    }
    return { stats, actions: [{ action: 'clean_session_archives', ...sessResult }], dryRun: DRY_RUN };
  }

  // 1. Clean GEP prompt .txt files
  console.log(`🧹 GEP Prompts (keep latest ${KEEP_PROMPTS}):`);
  const promptResult = cleanGepPrompts();
  if (promptResult.deleted > 0) {
    console.log(`  Deleted ${promptResult.deleted} of ${promptResult.total} .txt files (freed ${formatBytes(promptResult.freedBytes)})`);
    for (const f of promptResult.deletedFiles) {
      console.log(`    - ${f}`);
    }
    actions.push({ action: 'clean_gep_prompts', ...promptResult });
  } else {
    console.log(`  Nothing to clean (${promptResult.total} files, limit ${KEEP_PROMPTS})`);
  }
  console.log('');

  // 2. Clean GEP prompt .json artifacts
  console.log(`🧹 GEP Prompt JSONs (keep latest ${KEEP_PROMPTS}):`);
  const jsonResult = cleanGepPromptJsons();
  if (jsonResult.deleted > 0) {
    console.log(`  Deleted ${jsonResult.deleted} of ${jsonResult.total} .json files (freed ${formatBytes(jsonResult.freedBytes)})`);
    actions.push({ action: 'clean_gep_prompt_jsons', ...jsonResult });
  } else {
    console.log(`  Nothing to clean (${jsonResult.total} files)`);
  }
  console.log('');

  // 3. Compact memory graph
  console.log(`📦 Memory Graph (limit ${KEEP_GRAPH_LINES} lines):`);
  const graphResult = compactMemoryGraph();
  if (graphResult.skipped) {
    console.log(`  Skipped: ${graphResult.reason}`);
  } else {
    console.log(`  Compacted: ${graphResult.originalLines} → ${graphResult.newLines} lines`);
    console.log(`  Freed: ${formatBytes(graphResult.freedBytes)}`);
    actions.push({ action: 'compact_memory_graph', ...graphResult });
  }
  console.log('');

  // 4. Archive old daily notes
  console.log(`📦 Daily Notes Archive (older than ${ARCHIVE_DAYS} days):`);
  const archResult = archiveDailyNotes();
  if (archResult.skipped) {
    console.log(`  Skipped: ${archResult.reason}`);
  } else {
    console.log(`  Archived ${archResult.totalFiles} files into ${archResult.months} monthly archives`);
    for (const a of archResult.archived) {
      console.log(`  ${a.month}: ${a.files.length} files → ${a.archivePath}`);
    }
    console.log(`  Freed: ${formatBytes(archResult.freedBytes)}`);
    actions.push({ action: 'archive_daily', ...archResult });
  }
  console.log('');

  // 5. Deduplicate GEP candidates.jsonl
  console.log('🔧 GEP Candidates Deduplication:');
  const dedupResult = deduplicateCandidates();
  if (dedupResult.skipped) {
    console.log(`  Skipped: ${dedupResult.reason}`);
  } else {
    console.log(`  Deduped: ${dedupResult.originalCount} → ${dedupResult.newCount} entries (${dedupResult.compressionRatio} reduction)`);
    console.log(`  Freed: ${formatBytes(dedupResult.freedBytes)} (${formatBytes(dedupResult.originalSize)} → ${formatBytes(dedupResult.newSize)})`);
    actions.push({ action: 'dedup_candidates', ...dedupResult });
  }
  console.log('');

  // 6. Clean session archives
  console.log(`🗂️ Session Archives (max ${SESSION_ARCHIVE_MAX_COUNT} files, ${SESSION_ARCHIVE_MAX_AGE_DAYS} days):`);
  const sessResult = cleanSessionArchives();
  if (sessResult.skipped) {
    console.log(`  Skipped: ${sessResult.reason}`);
  } else {
    console.log(`  Deleted ${sessResult.deleted} of ${sessResult.total} sessions (freed ${formatBytes(sessResult.freedBytes)})`);
    console.log(`  Remaining: ${sessResult.remaining} sessions`);
    actions.push(sessResult);
  }
  console.log('');

  // Summary
  const totalFreed = actions.reduce((sum, a) => sum + (a.freedBytes || 0), 0);
  console.log(`✅ Done. ${DRY_RUN ? '[DRY RUN] Would free' : 'Freed'}: ${formatBytes(totalFreed)}`);

  return { stats, actions, totalFreed, dryRun: DRY_RUN };
}

// Export for require() and run if executed directly
module.exports = { main, collectStats, cleanGepPrompts, cleanGepPromptJsons, compactMemoryGraph, archiveDailyNotes, deduplicateCandidates, cleanSessionArchives, diskCleanup, cleanNpmCache, cleanPycache, cleanJournalLogs, cleanStaleLogs };

if (require.main === module) {
  main();
}
