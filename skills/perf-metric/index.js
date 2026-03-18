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

  // Hollow cycle detection: success with ≤4 lines changed is likely a no-op
  const HOLLOW_THRESHOLD = 4;
  const hollowCycles = events.filter(e =>
    e.outcome && e.outcome.status === 'success' &&
    e.blast_radius && e.blast_radius.lines <= HOLLOW_THRESHOLD
  );
  const hollowCount = hollowCycles.length;
  const hollowRate = total > 0 ? +(hollowCount / total).toFixed(3) : 0;
  const substantiveCycles = successes - hollowCount;
  const effectiveSuccessRate = total > 0 ? +(substantiveCycles / total).toFixed(3) : 0;

  // Recent hollow streak (consecutive hollow cycles at the end)
  let recentHollowStreak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const e = sorted[i];
    if (e.outcome && e.outcome.status === 'success' &&
        e.blast_radius && e.blast_radius.lines <= HOLLOW_THRESHOLD) {
      recentHollowStreak++;
    } else {
      break;
    }
  }

  // Protocol drift detection: intent-gene category mismatch
  const geneCategoryMap = {};
  for (const g of genes) {
    geneCategoryMap[g.id] = g.category;
  }
  const intentGeneMismatches = [];
  for (const e of sorted) {
    const intent = e.intent;
    const geneId = (e.genes_used || [])[0];
    if (!intent || !geneId || !geneCategoryMap[geneId]) continue;
    const geneCat = geneCategoryMap[geneId];
    // A mismatch is when the event intent doesn't align with the gene's category
    // e.g., intent=innovate but gene=repair, or intent=repair but gene=innovate
    if (intent !== geneCat && !(intent === 'optimize' || geneCat === 'optimize')) {
      intentGeneMismatches.push({
        eventId: e.id,
        at: (e.meta && e.meta.at) || null,
        intent,
        gene: geneId,
        geneCategory: geneCat
      });
    }
  }

  // Signal repetition analysis: detect recycled signal patterns
  const signalPatterns = {};
  const signalRepetitions = [];
  for (const e of sorted) {
    const key = (e.signals || []).slice().sort().join('|');
    if (!key) continue;
    if (!signalPatterns[key]) signalPatterns[key] = [];
    signalPatterns[key].push({ eventId: e.id, at: (e.meta && e.meta.at) || null });
  }
  for (const [pattern, occurrences] of Object.entries(signalPatterns)) {
    if (occurrences.length >= 3) {
      signalRepetitions.push({
        signals: pattern.split('|'),
        count: occurrences.length,
        recent: occurrences.slice(-3)
      });
    }
  }

  // Health assessment
  let healthScore = 1.0;
  const healthFlags = [];
  if (hollowRate > 0.5) {
    healthScore -= 0.3;
    healthFlags.push(`⚠️ High hollow rate (${(hollowRate * 100).toFixed(0)}% — over half of cycles are no-ops)`);
  } else if (hollowRate > 0.3) {
    healthScore -= 0.15;
    healthFlags.push(`⚡ Moderate hollow rate (${(hollowRate * 100).toFixed(0)}%)`);
  }
  if (recentHollowStreak >= 3) {
    healthScore -= 0.2;
    healthFlags.push(`⚠️ ${recentHollowStreak} consecutive hollow cycles — evolution may be stagnating`);
  }
  if (failures > 0 && (failures / total) > 0.3) {
    healthScore -= 0.2;
    healthFlags.push(`⚠️ High failure rate (${((failures / total) * 100).toFixed(0)}%)`);
  }
  if (currentStreak.type === 'failure' && currentStreak.count >= 3) {
    healthScore -= 0.2;
    healthFlags.push(`🔴 ${currentStreak.count}-cycle failure streak`);
  }
  if (intentGeneMismatches.length > 0) {
    const mismatchRate = intentGeneMismatches.length / total;
    if (mismatchRate > 0.2) {
      healthScore -= 0.15;
      healthFlags.push(`🔀 Protocol drift: ${intentGeneMismatches.length} intent-gene mismatches (${(mismatchRate * 100).toFixed(0)}%)`);
    } else if (intentGeneMismatches.length > 0) {
      healthFlags.push(`🔀 Minor drift: ${intentGeneMismatches.length} intent-gene mismatch(es)`);
    }
  }
  if (signalRepetitions.length > 0) {
    const worstRepeat = Math.max(...signalRepetitions.map(r => r.count));
    if (worstRepeat >= 5) {
      healthScore -= 0.1;
      healthFlags.push(`🔄 Signal recycling: ${signalRepetitions.length} pattern(s) repeated ${worstRepeat}+ times`);
    }
  }
  if (healthFlags.length === 0) {
    healthFlags.push('✅ Evolution system is healthy');
  }
  healthScore = Math.max(0, Math.min(1, +healthScore.toFixed(2)));

  return {
    summary: { total, successes, failures, successRate },
    intentBreakdown,
    geneEffectiveness,
    blastRadius,
    streaks: { current: currentStreak, longestSuccess, longestFailure },
    timeline,
    geneCount: genes.length,
    capsuleCount: capsules.length,
    hollowCycles: { count: hollowCount, rate: hollowRate, recentStreak: recentHollowStreak, threshold: HOLLOW_THRESHOLD },
    effectiveSuccessRate,
    protocolDrift: {
      intentGeneMismatches,
      mismatchCount: intentGeneMismatches.length,
      mismatchRate: total > 0 ? +(intentGeneMismatches.length / total).toFixed(3) : 0
    },
    signalRepetitions: {
      patterns: signalRepetitions,
      recycledPatternCount: signalRepetitions.length
    },
    health: { score: healthScore, flags: healthFlags }
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

  // Hollow Cycles
  lines.push('## Evolution Efficiency');
  lines.push(`- **Substantive cycles:** ${m.summary.successes - m.hollowCycles.count}/${m.summary.total} (${(m.effectiveSuccessRate * 100).toFixed(1)}%)`);
  lines.push(`- **Hollow cycles (≤${m.hollowCycles.threshold} lines):** ${m.hollowCycles.count} (${(m.hollowCycles.rate * 100).toFixed(1)}%)`);
  if (m.hollowCycles.recentStreak > 0) {
    lines.push(`- **Recent hollow streak:** ${m.hollowCycles.recentStreak} consecutive`);
  }
  lines.push('');

  // Health Assessment
  lines.push('## Health Assessment');
  lines.push(`- **Score:** ${(m.health.score * 100).toFixed(0)}%`);
  for (const flag of m.health.flags) {
    lines.push(`- ${flag}`);
  }
  lines.push('');

  // Protocol Drift
  if (m.protocolDrift.mismatchCount > 0) {
    lines.push('## Protocol Drift');
    lines.push(`- **Intent-gene mismatches:** ${m.protocolDrift.mismatchCount} (${(m.protocolDrift.mismatchRate * 100).toFixed(1)}%)`);
    for (const mm of m.protocolDrift.intentGeneMismatches.slice(-5)) {
      const date = mm.at ? mm.at.replace('T', ' ').slice(0, 19) : '?';
      lines.push(`  - \`${date}\` intent=${mm.intent} but gene=${mm.gene} (cat=${mm.geneCategory})`);
    }
    lines.push('');
  }

  // Signal Repetition
  if (m.signalRepetitions.recycledPatternCount > 0) {
    lines.push('## Signal Recycling');
    for (const sr of m.signalRepetitions.patterns) {
      lines.push(`- **${sr.signals.join(', ')}** — repeated ${sr.count}× (stagnation risk)`);
    }
    lines.push('');
  }

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
