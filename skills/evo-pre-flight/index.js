#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const EVO_DIR = path.join(ROOT, 'memory', 'evolution');
const EVOLVER_ASSETS = path.join(ROOT, 'skills', 'evolver', 'assets', 'gep');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check-only');
const jsonOutput = args.includes('--json');

const results = {
  timestamp: new Date().toISOString(),
  mode: checkOnly ? 'check-only' : 'auto-fix',
  checks: [],
  fixes: [],
  warnings: [],
  errors: [],
  summary: { checks: 0, fixes: 0, warnings: 0, errors: 0 }
};

function addCheck(name, status, detail) {
  results.checks.push({ name, status, detail });
  results.summary.checks++;
}

function addFix(name, detail) {
  results.fixes.push({ name, detail });
  results.summary.fixes++;
}

function addWarning(msg) {
  results.warnings.push(msg);
  results.summary.warnings++;
}

function addError(msg) {
  results.errors.push(msg);
  results.summary.errors++;
}

// 1. Check memory_graph size and auto-compact
function checkMemoryGraph() {
  const mgPath = path.join(EVO_DIR, 'memory_graph.jsonl');
  if (!fs.existsSync(mgPath)) {
    addCheck('memory_graph', 'skip', 'File not found');
    return;
  }
  const sizeKB = Math.round(fs.statSync(mgPath).size / 1024);
  if (sizeKB > 1024) {
    addWarning(`memory_graph.jsonl is ${sizeKB}KB (>1MB threshold)`);
    if (!checkOnly) {
      try {
        const compactorPath = path.join(ROOT, 'skills', 'evo-compactor', 'index.js');
        if (fs.existsSync(compactorPath)) {
          const out = execSync(`node ${compactorPath} --compact --json`, { encoding: 'utf8', timeout: 30000 });
          const r = JSON.parse(out);
          addFix('auto-compact', `Saved ${r.total_saved_KB}KB (graph: ${r.memory_graph.archived} archived, ${r.memory_graph.deduplicated} deduped)`);
        } else {
          addWarning('evo-compactor not found, skipping auto-compact');
        }
      } catch (e) {
        addError(`Auto-compact failed: ${e.message}`);
      }
    }
  } else {
    addCheck('memory_graph', 'ok', `${sizeKB}KB (within threshold)`);
  }
}

// 2. Check stale prompt files
function checkPromptFiles() {
  const promptFiles = [];
  try {
    const files = fs.readdirSync(EVO_DIR).filter(f => f.startsWith('gep_prompt_') && f.endsWith('.txt'));
    const threeDaysAgo = Date.now() - 3 * 24 * 3600 * 1000;
    for (const f of files) {
      const stat = fs.statSync(path.join(EVO_DIR, f));
      if (stat.mtimeMs < threeDaysAgo) {
        promptFiles.push(f);
      }
    }
  } catch (e) { /* ignore */ }

  if (promptFiles.length > 0) {
    addWarning(`${promptFiles.length} stale prompt files (>3 days old)`);
    if (!checkOnly) {
      for (const f of promptFiles) {
        try {
          fs.unlinkSync(path.join(EVO_DIR, f));
          // Also remove corresponding .json if exists
          const jsonF = f.replace('.txt', '.json');
          const jsonPath = path.join(EVO_DIR, jsonF);
          if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
        } catch (e) { /* ignore */ }
      }
      addFix('prompt-cleanup', `Removed ${promptFiles.length} stale prompt files`);
    }
  } else {
    addCheck('prompt_files', 'ok', 'No stale prompts');
  }
}

// 3. Validate evolution state JSON files
function checkStateFiles() {
  const stateFiles = [
    'evolution_state.json',
    'evolution_solidify_state.json',
    'personality_state.json'
  ];
  for (const sf of stateFiles) {
    const fp = path.join(EVO_DIR, sf);
    if (!fs.existsSync(fp)) {
      addCheck(sf, 'skip', 'Not found');
      continue;
    }
    try {
      JSON.parse(fs.readFileSync(fp, 'utf8'));
      addCheck(sf, 'ok', 'Valid JSON');
    } catch (e) {
      addError(`${sf}: Invalid JSON — ${e.message}`);
    }
  }
}

// 4. Validate genes.json and capsules.json
function checkGepAssets() {
  for (const asset of ['genes.json', 'capsules.json']) {
    const fp = path.join(EVOLVER_ASSETS, asset);
    if (!fs.existsSync(fp)) {
      addCheck(asset, 'skip', 'Not found');
      continue;
    }
    try {
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
      const count = Array.isArray(data) ? data.length : Object.keys(data).length;
      addCheck(asset, 'ok', `${count} entries, valid JSON`);
    } catch (e) {
      addError(`${asset}: Corrupted — ${e.message}`);
    }
  }
}

// 5. Check heartbeat state freshness
function checkHeartbeatState() {
  const hbPath = path.join(ROOT, 'memory', 'heartbeat-state.json');
  if (!fs.existsSync(hbPath)) {
    addCheck('heartbeat-state', 'skip', 'Not found');
    return;
  }
  try {
    const data = JSON.parse(fs.readFileSync(hbPath, 'utf8'));
    const staleEntries = [];
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    for (const [key, val] of Object.entries(data)) {
      if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
        const ts = new Date(val).getTime();
        if (ts < sevenDaysAgo) {
          const daysDiff = Math.round((Date.now() - ts) / (24 * 3600 * 1000));
          staleEntries.push(`${key}: ${val} (${daysDiff} days old)`);
        }
      }
    }
    if (staleEntries.length > 0) {
      addWarning(`Heartbeat state has ${staleEntries.length} stale entries: ${staleEntries.join('; ')}`);
    } else {
      addCheck('heartbeat-state', 'ok', 'All entries fresh');
    }
  } catch (e) {
    addError(`heartbeat-state.json: ${e.message}`);
  }
}

// 6. Disk usage check
function checkDisk() {
  try {
    const out = execSync("df -h / | tail -1 | awk '{print $5}'", { encoding: 'utf8' }).trim();
    const pct = parseInt(out);
    if (pct > 80) {
      addWarning(`Disk usage at ${pct}% (>80% threshold)`);
    } else {
      addCheck('disk', 'ok', `${pct}% used`);
    }
  } catch (e) {
    addCheck('disk', 'skip', 'Could not check');
  }
}

// Run all checks
checkMemoryGraph();
checkPromptFiles();
checkStateFiles();
checkGepAssets();
checkHeartbeatState();
checkDisk();

// Output
if (jsonOutput) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log(`🛫 Evo Pre-Flight [${results.mode}]`);
  console.log('═'.repeat(45));

  if (results.checks.length > 0) {
    console.log('\n✅ Checks:');
    for (const c of results.checks) {
      const icon = c.status === 'ok' ? '  ✓' : c.status === 'skip' ? '  ⊘' : '  ✗';
      console.log(`${icon} ${c.name}: ${c.detail}`);
    }
  }

  if (results.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    for (const w of results.warnings) console.log(`  • ${w}`);
  }

  if (results.fixes.length > 0) {
    console.log('\n🔧 Fixes Applied:');
    for (const f of results.fixes) console.log(`  • ${f.name}: ${f.detail}`);
  }

  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    for (const e of results.errors) console.log(`  • ${e}`);
  }

  console.log(`\n📊 Summary: ${results.summary.checks} checks, ${results.summary.fixes} fixes, ${results.summary.warnings} warnings, ${results.summary.errors} errors`);
}

// Export for require()
module.exports = { run: () => results };
