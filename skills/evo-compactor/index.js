#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || '/root/openclaw';
const MEMORY_GRAPH = path.join(WORKSPACE, 'memory/evolution/memory_graph.jsonl');
const MEMORY_GRAPH_ARCHIVE = path.join(WORKSPACE, 'memory/evolution/memory_graph_archive.jsonl');
const EVENTS = path.join(WORKSPACE, 'skills/evolver/assets/gep/events.jsonl');
const EVENTS_ARCHIVE = path.join(WORKSPACE, 'skills/evolver/assets/gep/events_archive.jsonl');
const PROMPT_DIR = path.join(WORKSPACE, 'memory/evolution');

const CANDIDATES = path.join(WORKSPACE, 'skills/evolver/assets/gep/candidates.jsonl');

const DAY_MS = 24 * 60 * 60 * 1000;
const GRAPH_MAX_AGE_DAYS = 7;
const EVENTS_MAX_AGE_DAYS = 7;
const EVENTS_KEEP_RECENT = 20;
const PROMPT_MAX_AGE_DAYS = 3;
const CANDIDATES_MAX_AGE_DAYS = 10;

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); }
      catch { return null; }
    })
    .filter(Boolean);
}

function writeJsonl(filePath, items) {
  fs.writeFileSync(filePath, items.map(i => JSON.stringify(i)).join('\n') + '\n');
}

function appendJsonl(filePath, items) {
  if (items.length === 0) return;
  const data = items.map(i => JSON.stringify(i)).join('\n') + '\n';
  fs.appendFileSync(filePath, data);
}

function getTimestamp(entry) {
  // Try various timestamp fields
  const ts = entry.ts || entry.timestamp || entry.created_at;
  if (!ts) return 0;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function compactMemoryGraph(dryRun) {
  const entries = readJsonl(MEMORY_GRAPH);
  if (entries.length === 0) return { kept: 0, archived: 0, sizeBeforeKB: 0, sizeAfterKB: 0 };

  const sizeBefore = fs.existsSync(MEMORY_GRAPH) ? fs.statSync(MEMORY_GRAPH).size : 0;
  const cutoff = Date.now() - (GRAPH_MAX_AGE_DAYS * DAY_MS);

  // Partition: recent vs old
  const recent = [];
  const old = [];
  for (const e of entries) {
    const ts = getTimestamp(e);
    if (ts > cutoff || ts === 0) {
      recent.push(e);
    } else {
      old.push(e);
    }
  }

  // Deduplicate recent entries by kind+gene combination
  const seen = new Set();
  const deduped = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const e = recent[i];
    const key = `${e.kind || ''}:${(e.gene && e.gene.id) || ''}:${(e.signal && e.signal.key) || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.unshift(e);
    } else {
      old.push(e); // deduped entries go to archive
    }
  }

  if (!dryRun && old.length > 0) {
    appendJsonl(MEMORY_GRAPH_ARCHIVE, old);
    writeJsonl(MEMORY_GRAPH, deduped);
  }

  const sizeAfter = dryRun ? sizeBefore : (deduped.length > 0 ? Buffer.byteLength(deduped.map(i => JSON.stringify(i)).join('\n') + '\n') : 0);

  return {
    kept: deduped.length,
    archived: old.length,
    deduplicated: recent.length - deduped.length,
    sizeBeforeKB: Math.round(sizeBefore / 1024),
    sizeAfterKB: Math.round(sizeAfter / 1024),
    savedKB: Math.round((sizeBefore - sizeAfter) / 1024)
  };
}

function compactEvents(dryRun) {
  const entries = readJsonl(EVENTS);
  if (entries.length === 0) return { kept: 0, archived: 0 };

  const sizeBefore = fs.statSync(EVENTS).size;
  const cutoff = Date.now() - (EVENTS_MAX_AGE_DAYS * DAY_MS);

  // Always keep the last EVENTS_KEEP_RECENT entries
  const keepCount = Math.max(EVENTS_KEEP_RECENT, 0);
  const mustKeep = entries.slice(-keepCount);
  const candidates = entries.slice(0, -keepCount || entries.length);

  const toArchive = [];
  const toKeep = [];
  for (const e of candidates) {
    const ts = getTimestamp(e);
    if (ts > 0 && ts < cutoff) {
      toArchive.push(e);
    } else {
      toKeep.push(e);
    }
  }

  const finalKeep = [...toKeep, ...mustKeep];

  if (!dryRun && toArchive.length > 0) {
    appendJsonl(EVENTS_ARCHIVE, toArchive);
    writeJsonl(EVENTS, finalKeep);
  }

  const sizeAfter = dryRun ? sizeBefore : Buffer.byteLength(finalKeep.map(i => JSON.stringify(i)).join('\n') + '\n');

  return {
    kept: finalKeep.length,
    archived: toArchive.length,
    sizeBeforeKB: Math.round(sizeBefore / 1024),
    sizeAfterKB: Math.round(sizeAfter / 1024),
    savedKB: Math.round((sizeBefore - sizeAfter) / 1024)
  };
}

function compactCandidates(dryRun) {
  const entries = readJsonl(CANDIDATES);
  if (entries.length === 0) return { kept: 0, removed: 0, sizeBeforeKB: 0, sizeAfterKB: 0, savedKB: 0 };

  const sizeBefore = fs.existsSync(CANDIDATES) ? fs.statSync(CANDIDATES).size : 0;
  const cutoff = Date.now() - (CANDIDATES_MAX_AGE_DAYS * DAY_MS);

  const keep = [];
  const remove = [];
  for (const c of entries) {
    const ts = getTimestamp(c);
    if (ts > cutoff || ts === 0) {
      keep.push(c);
    } else {
      remove.push(c);
    }
  }

  if (!dryRun && remove.length > 0) {
    writeJsonl(CANDIDATES, keep);
  }

  const sizeAfter = dryRun ? sizeBefore : (keep.length > 0 ? Buffer.byteLength(keep.map(i => JSON.stringify(i)).join('\n') + '\n') : 0);

  return {
    kept: keep.length,
    removed: remove.length,
    sizeBeforeKB: Math.round(sizeBefore / 1024),
    sizeAfterKB: Math.round(sizeAfter / 1024),
    savedKB: Math.round((sizeBefore - sizeAfter) / 1024)
  };
}

function cleanPromptFiles(dryRun) {
  if (!fs.existsSync(PROMPT_DIR)) return { deleted: 0, kept: 0, savedKB: 0 };

  const files = fs.readdirSync(PROMPT_DIR)
    .filter(f => f.startsWith('gep_prompt_') && f.endsWith('.txt'));

  const cutoff = Date.now() - (PROMPT_MAX_AGE_DAYS * DAY_MS);
  let deletedCount = 0;
  let deletedSize = 0;
  let keptCount = 0;

  for (const f of files) {
    const fp = path.join(PROMPT_DIR, f);
    const stat = fs.statSync(fp);
    if (stat.mtimeMs < cutoff) {
      deletedSize += stat.size;
      if (!dryRun) {
        fs.unlinkSync(fp);
      }
      deletedCount++;
    } else {
      keptCount++;
    }
  }

  return {
    deleted: deletedCount,
    kept: keptCount,
    savedKB: Math.round(deletedSize / 1024)
  };
}

function main() {
  const args = process.argv.slice(2);
  const doCompact = args.includes('--compact');
  const jsonOutput = args.includes('--json');
  const dryRun = !doCompact;

  const results = {
    mode: dryRun ? 'dry-run' : 'compact',
    timestamp: new Date().toISOString(),
    memory_graph: compactMemoryGraph(dryRun),
    events: compactEvents(dryRun),
    candidates: compactCandidates(dryRun),
    prompt_files: cleanPromptFiles(dryRun),
  };

  results.total_saved_KB = (results.memory_graph.savedKB || 0)
    + (results.events.savedKB || 0)
    + (results.candidates.savedKB || 0)
    + (results.prompt_files.savedKB || 0);

  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Human-readable output
  const mode = dryRun ? '🔍 DRY RUN' : '🗜️ COMPACTED';
  console.log(`\n${mode} — Evolution Data Compactor`);
  console.log('═'.repeat(45));

  const mg = results.memory_graph;
  console.log(`\n📊 memory_graph.jsonl:`);
  console.log(`   Before: ${mg.sizeBeforeKB} KB`);
  console.log(`   Kept: ${mg.kept} entries, Archived: ${mg.archived}, Deduped: ${mg.deduplicated || 0}`);
  if (!dryRun) console.log(`   After: ${mg.sizeAfterKB} KB (saved ${mg.savedKB} KB)`);

  const ev = results.events;
  console.log(`\n📋 events.jsonl:`);
  console.log(`   Before: ${ev.sizeBeforeKB} KB`);
  console.log(`   Kept: ${ev.kept} entries, Archived: ${ev.archived}`);
  if (!dryRun) console.log(`   After: ${ev.sizeAfterKB} KB (saved ${ev.savedKB} KB)`);

  const pf = results.prompt_files;
  console.log(`\n📝 GEP prompt files:`);
  console.log(`   Deleted: ${pf.deleted}, Kept: ${pf.kept}`);
  console.log(`   Freed: ${pf.savedKB} KB`);

  const cd = results.candidates;
  console.log(`\n🎯 candidates.jsonl:`);
  console.log(`   Before: ${cd.sizeBeforeKB} KB`);
  console.log(`   Kept: ${cd.kept}, Removed: ${cd.removed}`);
  if (!dryRun) console.log(`   After: ${cd.sizeAfterKB} KB (saved ${cd.savedKB} KB)`);

  console.log(`\n💾 Total ${dryRun ? 'potential ' : ''}savings: ${results.total_saved_KB} KB`);
  if (dryRun) console.log(`\n💡 Run with --compact to apply changes.`);
}

// Exports for programmatic use
module.exports = { compactMemoryGraph, compactEvents, compactCandidates, cleanPromptFiles, main };

// CLI execution
if (require.main === module) {
  main();
}
