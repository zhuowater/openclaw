const fs = require('fs');
const path = require('path');

const DEFAULT_ASSETS = path.resolve(__dirname, '..', 'evolver', 'assets', 'gep');

/**
 * Parse events from events.jsonl (only EvolutionEvent rows)
 */
function loadEvents(assetsDir) {
  const fp = path.join(assetsDir, 'events.jsonl');
  if (!fs.existsSync(fp)) return [];
  return fs.readFileSync(fp, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(o => o && o.type === 'EvolutionEvent');
}

function loadJSON(assetsDir, file) {
  const fp = path.join(assetsDir, file);
  if (!fs.existsSync(fp)) return null;
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return null; }
}

/**
 * Analyze GEP evolution performance
 * @param {string} [assetsDir] - path to GEP assets directory
 * @returns {object} metrics
 */
function analyze(assetsDir) {
  assetsDir = assetsDir || DEFAULT_ASSETS;
  const events = loadEvents(assetsDir);
  const genesData = loadJSON(assetsDir, 'genes.json');
  const capsulesData = loadJSON(assetsDir, 'capsules.json');

  const genes = genesData ? (genesData.genes || []) : [];
  const capsules = capsulesData ? (capsulesData.capsules || []) : [];

  // Summary
  const total = events.length;
  const successes = events.filter(e => e.outcome && e.outcome.status === 'success').length;
  const failures = total - successes;
  const successRate = total > 0 ? +(successes / total).toFixed(3) : 0;

  // Intent breakdown
  const intentBreakdown = {};
  for (const e of events) {
    const intent = e.intent || 'unknown';
    if (!intentBreakdown[intent]) intentBreakdown[intent] = { total: 0, success: 0, failed: 0 };
    intentBreakdown[intent].total++;
    if (e.outcome && e.outcome.status === 'success') intentBreakdown[intent].success++;
    else intentBreakdown[intent].failed++;
  }

  // Gene effectiveness
  const geneStats = {};
  for (const e of events) {
    const geneIds = e.genes_used || [];
    for (const gid of geneIds) {
      if (!geneStats[gid]) geneStats[gid] = { success: 0, failed: 0 };
      if (e.outcome && e.outcome.status === 'success') geneStats[gid].success++;
      else geneStats[gid].failed++;
    }
  }
  const geneEffectiveness = {};
  for (const [gid, s] of Object.entries(geneStats)) {
    const t = s.success + s.failed;
    geneEffectiveness[gid] = { ...s, total: t, successRate: t > 0 ? +(s.success / t).toFixed(3) : 0 };
  }

  // Blast radius stats
  const blasts = events
    .filter(e => e.blast_radius)
    .map(e => e.blast_radius);
  const blastRadius = { files: { min: 0, max: 0, avg: 0 }, lines: { min: 0, max: 0, avg: 0 } };
  if (blasts.length > 0) {
    const filesArr = blasts.map(b => b.files || 0);
    const linesArr = blasts.map(b => b.lines || 0);
    blastRadius.files = {
      min: Math.min(...filesArr),
      max: Math.max(...filesArr),
      avg: +(filesArr.reduce((a, b) => a + b, 0) / filesArr.length).toFixed(1)
    };
    blastRadius.lines = {
      min: Math.min(...linesArr),
      max: Math.max(...linesArr),
      avg: +(linesArr.reduce((a, b) => a + b, 0) / linesArr.length).toFixed(1)
    };
  }

  // Streaks
  let currentStreak = { type: null, count: 0 };
  let longestSuccess = 0;
  let longestFailure = 0;
  let tmpSuccess = 0;
  let tmpFailure = 0;
  const sorted = [...events].sort((a, b) => {
    const ta = a.meta && a.meta.at ? new Date(a.meta.at).getTime() : 0;
    const tb = b.meta && b.meta.at ? new Date(b.meta.at).getTime() : 0;
    return ta - tb;
  });
  for (const e of sorted) {
    const ok = e.outcome && e.outcome.status === 'success';
    if (ok) {
      tmpSuccess++;
      tmpFailure = 0;
      if (tmpSuccess > longestSuccess) longestSuccess = tmpSuccess;
    } else {
      tmpFailure++;
      tmpSuccess = 0;
      if (tmpFailure > longestFailure) longestFailure = tmpFailure;
    }
  }
  if (sorted.length > 0) {
    const last = sorted[sorted.length - 1];
    const lastOk = last.outcome && last.outcome.status === 'success';
    currentStreak = { type: lastOk ? 'success' : 'failure', count: lastOk ? tmpSuccess : tmpFailure };
  }

  // Timeline
  const timeline = sorted.map(e => ({
    id: e.id,
    at: (e.meta && e.meta.at) || null,
    intent: e.intent,
    gene: (e.genes_used || [])[0] || null,
    status: e.outcome ? e.outcome.status : 'unknown',
    files: e.blast_radius ? e.blast_radius.files : 0,
    lines: e.blast_radius ? e.blast_radius.lines : 0
  }));

  return {
    summary: { total, successes, failures, successRate },
    intentBreakdown,
    geneEffectiveness,
    blastRadius,
    streaks: { current: currentStreak, longestSuccess, longestFailure },
    timeline,
    geneCount: genes.length,
    capsuleCount: capsules.length
  };
}

/**
 * Generate a human-readable markdown performance report
 * @param {string} [assetsDir]
 * @returns {string}
 */
function report(assetsDir) {
  const m = analyze(assetsDir);
  const lines = [];
  lines.push('# GEP Evolution Performance Report\n');

  // Summary
  lines.push('## Summary');
  lines.push(`- **Total cycles:** ${m.summary.total}`);
  lines.push(`- **Success:** ${m.summary.successes} (${(m.summary.successRate * 100).toFixed(1)}%)`);
  lines.push(`- **Failed:** ${m.summary.failures}`);
  lines.push(`- **Genes:** ${m.geneCount} | **Capsules:** ${m.capsuleCount}`);
  lines.push('');

  // Intent breakdown
  lines.push('## Intent Breakdown');
  for (const [intent, s] of Object.entries(m.intentBreakdown)) {
    const rate = s.total > 0 ? ((s.success / s.total) * 100).toFixed(0) : 0;
    lines.push(`- **${intent}:** ${s.total} total, ${s.success} success, ${s.failed} failed (${rate}%)`);
  }
  lines.push('');

  // Gene effectiveness
  lines.push('## Gene Effectiveness');
  for (const [gid, s] of Object.entries(m.geneEffectiveness)) {
    lines.push(`- **${gid}:** ${s.success}/${s.total} success (${(s.successRate * 100).toFixed(0)}%)`);
  }
  lines.push('');

  // Blast radius
  lines.push('## Blast Radius');
  lines.push(`- **Files:** min=${m.blastRadius.files.min}, max=${m.blastRadius.files.max}, avg=${m.blastRadius.files.avg}`);
  lines.push(`- **Lines:** min=${m.blastRadius.lines.min}, max=${m.blastRadius.lines.max}, avg=${m.blastRadius.lines.avg}`);
  lines.push('');

  // Streaks
  lines.push('## Streaks');
  lines.push(`- **Current:** ${m.streaks.current.count}× ${m.streaks.current.type || 'none'}`);
  lines.push(`- **Longest success:** ${m.streaks.longestSuccess}`);
  lines.push(`- **Longest failure:** ${m.streaks.longestFailure}`);
  lines.push('');

  // Timeline
  lines.push('## Timeline (recent)');
  const recent = m.timeline.slice(-8);
  for (const t of recent) {
    const date = t.at ? t.at.replace('T', ' ').slice(0, 19) : '?';
    const icon = t.status === 'success' ? '✅' : '❌';
    lines.push(`- ${icon} \`${date}\` [${t.intent}] ${t.gene || '?'} (${t.files}f/${t.lines}l)`);
  }

  return lines.join('\n');
}

// CLI entry
if (require.main === module) {
  console.log(report());
}

module.exports = { analyze, report };
