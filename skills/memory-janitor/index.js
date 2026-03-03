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

  // Summary
  const totalFreed = actions.reduce((sum, a) => sum + (a.freedBytes || 0), 0);
  console.log(`✅ Done. ${DRY_RUN ? '[DRY RUN] Would free' : 'Freed'}: ${formatBytes(totalFreed)}`);

  return { stats, actions, totalFreed, dryRun: DRY_RUN };
}

// Export for require() and run if executed directly
module.exports = { main, collectStats, cleanGepPrompts, cleanGepPromptJsons, compactMemoryGraph, archiveDailyNotes };

if (require.main === module) {
  main();
}
