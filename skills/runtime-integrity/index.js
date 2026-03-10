/**
 * runtime-integrity — Runtime file integrity monitor for OpenClaw
 * 
 * Maintains SHA-256 hash baselines of critical files and detects
 * unauthorized modifications at runtime.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { glob } = require('fs');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || '/root/openclaw';
const BASELINE_PATH = path.join(WORKSPACE, 'memory', 'integrity-baseline.json');

// Categories of monitored files
const CATEGORIES = {
  config: [
    'openclaw.json',
    'package.json',
    '.env',
    'AGENTS.md',
    'SOUL.md',
    'IDENTITY.md',
    'USER.md',
    'HEARTBEAT.md',
    'TOOLS.md',
  ],
  system: [
    'skills/evolver/index.js',
    'skills/evolver/package.json',
    'skills/evolver/src/evolve.js',
    'skills/evolver/src/gep/solidify.js',
    'skills/evolver/src/gep/prompt.js',
    'skills/evolver/src/gep/selector.js',
  ],
  // skills category is dynamically populated
};

/**
 * Compute SHA-256 hash of a file
 */
function hashFile(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Discover all skill entry points
 */
function discoverSkillFiles() {
  const skillsDir = path.join(WORKSPACE, 'skills');
  const files = [];
  try {
    const skills = fs.readdirSync(skillsDir).filter(d => {
      try { return fs.statSync(path.join(skillsDir, d)).isDirectory(); }
      catch { return false; }
    });
    for (const skill of skills) {
      const indexPath = path.join('skills', skill, 'index.js');
      if (fs.existsSync(path.join(WORKSPACE, indexPath))) {
        files.push(indexPath);
      }
      const skillMd = path.join('skills', skill, 'SKILL.md');
      if (fs.existsSync(path.join(WORKSPACE, skillMd))) {
        files.push(skillMd);
      }
    }
  } catch (err) {
    // skills dir doesn't exist
  }
  return files;
}

/**
 * Get all monitored files by category
 */
function getAllMonitoredFiles(category) {
  const result = {};
  
  if (!category || category === 'config') {
    result.config = CATEGORIES.config;
  }
  if (!category || category === 'system') {
    result.system = CATEGORIES.system;
  }
  if (!category || category === 'skills') {
    result.skills = discoverSkillFiles();
  }
  
  return result;
}

/**
 * Create baseline of all monitored files
 */
function createBaseline() {
  const categorized = getAllMonitoredFiles();
  const baseline = {
    created_at: new Date().toISOString(),
    workspace: WORKSPACE,
    files: {},
  };

  let total = 0;
  for (const [cat, files] of Object.entries(categorized)) {
    for (const relPath of files) {
      const absPath = path.join(WORKSPACE, relPath);
      const hash = hashFile(absPath);
      if (hash) {
        baseline.files[relPath] = { hash, category: cat };
        total++;
      }
    }
  }

  // Ensure memory dir exists
  const dir = path.dirname(BASELINE_PATH);
  if (!dir.includes('memory')) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
  return { total, path: BASELINE_PATH, created_at: baseline.created_at };
}

/**
 * Check integrity against baseline
 */
function checkIntegrity(category, jsonOutput) {
  if (!fs.existsSync(BASELINE_PATH)) {
    return { error: 'No baseline found. Run: node index.js baseline' };
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const results = {
    baseline_created: baseline.created_at,
    checked_at: new Date().toISOString(),
    summary: { pass: 0, modified: 0, missing: 0, new: 0 },
    details: [],
  };

  // Check files in baseline
  for (const [relPath, info] of Object.entries(baseline.files)) {
    if (category && info.category !== category) continue;
    
    const absPath = path.join(WORKSPACE, relPath);
    const currentHash = hashFile(absPath);

    if (currentHash === null) {
      results.summary.missing++;
      results.details.push({ file: relPath, status: 'MISSING', category: info.category });
    } else if (currentHash !== info.hash) {
      results.summary.modified++;
      results.details.push({
        file: relPath,
        status: 'MODIFIED',
        category: info.category,
        baseline_hash: info.hash.slice(0, 12),
        current_hash: currentHash.slice(0, 12),
      });
    } else {
      results.summary.pass++;
    }
  }

  // Check for new files not in baseline
  const currentFiles = getAllMonitoredFiles(category);
  for (const [cat, files] of Object.entries(currentFiles)) {
    for (const relPath of files) {
      if (!baseline.files[relPath]) {
        results.summary.new++;
        results.details.push({ file: relPath, status: 'NEW', category: cat });
      }
    }
  }

  // Compute integrity score
  const total = results.summary.pass + results.summary.modified + results.summary.missing;
  results.integrity_score = total > 0 
    ? Math.round((results.summary.pass / total) * 100) 
    : 100;

  return results;
}

/**
 * Show baseline status
 */
function showStatus() {
  if (!fs.existsSync(BASELINE_PATH)) {
    return { exists: false, message: 'No baseline found.' };
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const fileCount = Object.keys(baseline.files).length;
  const categories = {};
  for (const info of Object.values(baseline.files)) {
    categories[info.category] = (categories[info.category] || 0) + 1;
  }
  return {
    exists: true,
    created_at: baseline.created_at,
    total_files: fileCount,
    by_category: categories,
    path: BASELINE_PATH,
  };
}

// ── CLI ──
function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'check';
  const jsonFlag = args.includes('--json');
  const catIdx = args.indexOf('--category');
  const category = catIdx >= 0 ? args[catIdx + 1] : null;

  let result;
  switch (command) {
    case 'baseline':
      result = createBaseline();
      if (jsonFlag) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`✅ Baseline created: ${result.total} files tracked`);
        console.log(`   Saved to: ${result.path}`);
        console.log(`   Created at: ${result.created_at}`);
      }
      break;

    case 'check':
      result = checkIntegrity(category, jsonFlag);
      if (result.error) {
        console.error(`❌ ${result.error}`);
        process.exit(1);
      }
      if (jsonFlag) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`\n🔒 Integrity Check Report`);
        console.log(`   Baseline: ${result.baseline_created}`);
        console.log(`   Checked:  ${result.checked_at}`);
        console.log(`   Score:    ${result.integrity_score}%\n`);
        console.log(`   ✅ Pass:     ${result.summary.pass}`);
        console.log(`   ⚠️  Modified: ${result.summary.modified}`);
        console.log(`   ❌ Missing:  ${result.summary.missing}`);
        console.log(`   🆕 New:      ${result.summary.new}`);
        if (result.details.length > 0) {
          console.log(`\n   Details:`);
          for (const d of result.details) {
            const icon = d.status === 'MODIFIED' ? '⚠️' : d.status === 'MISSING' ? '❌' : '🆕';
            console.log(`   ${icon} [${d.category}] ${d.file} — ${d.status}`);
          }
        }
      }
      break;

    case 'status':
      result = showStatus();
      if (jsonFlag) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (!result.exists) {
          console.log('No baseline found. Run: node index.js baseline');
        } else {
          console.log(`📋 Baseline Status`);
          console.log(`   Created: ${result.created_at}`);
          console.log(`   Files:   ${result.total_files}`);
          for (const [cat, count] of Object.entries(result.by_category)) {
            console.log(`   - ${cat}: ${count}`);
          }
        }
      }
      break;

    default:
      console.log('Usage: node index.js <baseline|check|status> [--json] [--category <config|skills|system>]');
  }
}

// Exports for programmatic use
module.exports = { createBaseline, checkIntegrity, showStatus, hashFile, main };

if (require.main === module) {
  main();
}
