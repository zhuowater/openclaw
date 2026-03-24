'use strict';

const { execSync } = require('child_process');
const path = require('path');

const REPO_ROOT = process.env.GIT_INSIGHTS_ROOT || '/root/openclaw';

function git(cmd, opts = {}) {
  const cwd = opts.cwd || REPO_ROOT;
  try {
    return execSync(`git ${cmd}`, { cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).trim();
  } catch (e) {
    return '';
  }
}

function sinceArg(days) {
  const d = new Date();
  d.setDate(d.getDate() - (days || 90));
  return `--since="${d.toISOString().split('T')[0]}"`;
}

/**
 * Hotspots: most frequently changed files
 */
async function hotspots(opts = {}) {
  const { days = 90, limit = 20, pathFilter } = opts;
  const since = sinceArg(days);
  const pathArg = pathFilter ? `-- "${pathFilter}"` : '';
  
  // Get per-file change counts with numstat
  const log = git(`log ${since} --pretty=format:"" --numstat ${pathArg}`);
  if (!log) return [];
  
  const fileStats = {};
  for (const line of log.split('\n')) {
    const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!m) continue;
    const added = m[1] === '-' ? 0 : parseInt(m[1], 10);
    const deleted = m[2] === '-' ? 0 : parseInt(m[2], 10);
    const file = m[3];
    if (!fileStats[file]) fileStats[file] = { file, changes: 0, insertions: 0, deletions: 0 };
    fileStats[file].changes++;
    fileStats[file].insertions += added;
    fileStats[file].deletions += deleted;
  }
  
  return Object.values(fileStats)
    .sort((a, b) => b.changes - a.changes)
    .slice(0, limit);
}

/**
 * Coupling: files that frequently change together in the same commit
 */
async function coupling(opts = {}) {
  const { days = 90, minCooccurrences = 3, limit = 20 } = opts;
  const since = sinceArg(days);
  
  // Get list of files per commit
  const log = git(`log ${since} --pretty=format:"COMMIT_SEP" --name-only`);
  if (!log) return [];
  
  const commits = log.split('COMMIT_SEP')
    .map(c => c.trim().split('\n').filter(f => f && f.length > 0))
    .filter(c => c.length >= 2 && c.length <= 30); // Skip huge commits (merges)
  
  const pairCount = {};
  const fileCommitCount = {};
  
  for (const files of commits) {
    for (const f of files) {
      fileCommitCount[f] = (fileCommitCount[f] || 0) + 1;
    }
    // Generate pairs
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const pair = [files[i], files[j]].sort().join('|||');
        pairCount[pair] = (pairCount[pair] || 0) + 1;
      }
    }
  }
  
  const results = [];
  for (const [pair, count] of Object.entries(pairCount)) {
    if (count < minCooccurrences) continue;
    const [a, b] = pair.split('|||');
    const maxCommits = Math.max(fileCommitCount[a] || 1, fileCommitCount[b] || 1);
    results.push({
      files: [a, b],
      cooccurrences: count,
      strength: parseFloat((count / maxCommits).toFixed(3))
    });
  }
  
  return results.sort((a, b) => b.cooccurrences - a.cooccurrences).slice(0, limit);
}

/**
 * Velocity: commit count over time buckets
 */
async function velocity(opts = {}) {
  const { days = 30, bucket = 'day' } = opts;
  const since = sinceArg(days);
  
  const log = git(`log ${since} --pretty=format:"%aI"`);
  if (!log) return [];
  
  const buckets = {};
  for (const dateStr of log.split('\n')) {
    if (!dateStr) continue;
    let key;
    if (bucket === 'week') {
      const d = new Date(dateStr);
      const startOfWeek = new Date(d);
      startOfWeek.setDate(d.getDate() - d.getDay());
      key = startOfWeek.toISOString().split('T')[0];
    } else {
      key = dateStr.split('T')[0];
    }
    buckets[key] = (buckets[key] || 0) + 1;
  }
  
  return Object.entries(buckets)
    .map(([date, commits]) => ({ date, commits }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Churn: lines added + removed per file (volatility indicator)
 */
async function churn(opts = {}) {
  const { days = 30, limit = 15, pathFilter } = opts;
  const since = sinceArg(days);
  const pathArg = pathFilter ? `-- "${pathFilter}"` : '';
  
  const log = git(`log ${since} --pretty=format:"" --numstat ${pathArg}`);
  if (!log) return [];
  
  const fileStats = {};
  for (const line of log.split('\n')) {
    const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!m) continue;
    const added = m[1] === '-' ? 0 : parseInt(m[1], 10);
    const removed = m[2] === '-' ? 0 : parseInt(m[2], 10);
    const file = m[3];
    if (!fileStats[file]) fileStats[file] = { file, added: 0, removed: 0 };
    fileStats[file].added += added;
    fileStats[file].removed += removed;
  }
  
  return Object.values(fileStats)
    .map(f => ({
      ...f,
      net: f.added - f.removed,
      churnRate: f.added + f.removed
    }))
    .sort((a, b) => b.churnRate - a.churnRate)
    .slice(0, limit);
}

/**
 * Full report combining all analyses
 */
async function fullReport(opts = {}) {
  const days = opts.days || 90;
  const [h, c, v, ch] = await Promise.all([
    hotspots({ ...opts, days }),
    coupling({ ...opts, days }),
    velocity({ days: Math.min(days, 30) }),
    churn({ ...opts, days: Math.min(days, 30) })
  ]);
  
  return { hotspots: h, coupling: c, velocity: v, churn: ch, meta: { days, generatedAt: new Date().toISOString() } };
}

// CLI mode
if (require.main === module) {
  const args = process.argv.slice(2);
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) { flags.days = parseInt(args[++i], 10); }
    else if (args[i] === '--limit' && args[i + 1]) { flags.limit = parseInt(args[++i], 10); }
    else if (args[i] === '--path' && args[i + 1]) { flags.pathFilter = args[++i]; }
    else if (args[i] === '--json') { flags.json = true; }
    else if (args[i] === '--hotspots') { flags.mode = 'hotspots'; }
    else if (args[i] === '--coupling') { flags.mode = 'coupling'; }
    else if (args[i] === '--velocity') { flags.mode = 'velocity'; }
    else if (args[i] === '--churn') { flags.mode = 'churn'; }
  }
  
  (async () => {
    let result;
    switch (flags.mode) {
      case 'hotspots': result = await hotspots(flags); break;
      case 'coupling': result = await coupling(flags); break;
      case 'velocity': result = await velocity(flags); break;
      case 'churn': result = await churn(flags); break;
      default: result = await fullReport(flags);
    }
    
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Pretty-print
      if (flags.mode === 'hotspots' || (!flags.mode && result.hotspots)) {
        const data = flags.mode ? result : result.hotspots;
        console.log('\n🔥 HOTSPOTS (Most Frequently Changed Files)');
        console.log('─'.repeat(60));
        for (const h of data.slice(0, 15)) {
          console.log(`  ${String(h.changes).padStart(4)} changes │ +${h.insertions}/-${h.deletions} │ ${h.file}`);
        }
      }
      if (flags.mode === 'coupling' || (!flags.mode && result.coupling)) {
        const data = flags.mode ? result : result.coupling;
        console.log('\n🔗 COUPLING (Files That Change Together)');
        console.log('─'.repeat(60));
        for (const c of data.slice(0, 10)) {
          console.log(`  ${String(c.cooccurrences).padStart(3)}x (${(c.strength * 100).toFixed(0)}%) │ ${c.files[0]} ↔ ${c.files[1]}`);
        }
      }
      if (flags.mode === 'velocity' || (!flags.mode && result.velocity)) {
        const data = flags.mode ? result : result.velocity;
        console.log('\n📈 VELOCITY (Commits Per Day)');
        console.log('─'.repeat(60));
        for (const v of data.slice(-14)) { // Last 14 entries
          const bar = '█'.repeat(Math.min(v.commits, 40));
          console.log(`  ${v.date} │ ${bar} ${v.commits}`);
        }
      }
      if (flags.mode === 'churn' || (!flags.mode && result.churn)) {
        const data = flags.mode ? result : result.churn;
        console.log('\n🌀 CHURN (Highest Volatility Files)');
        console.log('─'.repeat(60));
        for (const c of data.slice(0, 10)) {
          console.log(`  ${String(c.churnRate).padStart(6)} churn │ +${c.added}/-${c.removed} (net ${c.net > 0 ? '+' : ''}${c.net}) │ ${c.file}`);
        }
      }
      console.log('');
    }
  })().catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { hotspots, coupling, velocity, churn, fullReport };
