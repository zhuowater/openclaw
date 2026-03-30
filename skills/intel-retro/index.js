#!/usr/bin/env node
'use strict';

/**
 * intel-retro — Intelligence Retrospective
 * 
 * Extracts predictions from daily intelligence reports,
 * scores them against outcomes, and computes accuracy metrics.
 */

const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.resolve(__dirname, '../../memory');
const SCORES_FILE = path.join(MEMORY_DIR, 'intel-retro-scores.json');

// ─── Prediction Extraction ───

const PREDICTION_PATTERNS = [
  // Chinese markers
  /趋势预判[：:]\s*([\s\S]*?)(?=\n(?:#{1,4}\s|\*\*行动建议|---|\n\n))/gm,
  /预[测判][：:]\s*(.+)/g,
  // English markers
  /(?:predict|forecast|expect|anticipate|will likely|probability)[：:\s]+(.+)/gi,
  // Bullet predictions under trend sections
  /[-•]\s*(?:短期|中期|长期|short.?term|mid.?term|long.?term)[：:]\s*(.+)/gi,
];

const CONFIDENCE_MAP = {
  '高': 0.85, '很可能': 0.85, 'highly likely': 0.85, 'very likely': 0.85,
  '中': 0.60, '可能': 0.60, 'likely': 0.60, 'probable': 0.60,
  '低': 0.30, '不太可能': 0.30, 'unlikely': 0.30, 'possible': 0.30,
  '极低': 0.10, '几乎不可能': 0.10, 'very unlikely': 0.10,
};

function extractConfidence(text) {
  const lower = text.toLowerCase();
  for (const [keyword, score] of Object.entries(CONFIDENCE_MAP)) {
    if (lower.includes(keyword.toLowerCase())) return score;
  }
  return 0.50; // default medium confidence
}

function extractDomain(text) {
  const lower = text.toLowerCase();
  if (/战争|军事|地缘|伊朗|以色列|nato|war|geopolit|conflict|ceasefire|停火/.test(lower)) return 'geopolitics';
  if (/漏洞|cve|攻击|安全|cyber|malware|apt|exploit|breach|zero.?day/.test(lower)) return 'cybersecurity';
  if (/市场|btc|比特币|价格|交易|stock|crypto|oil|gold|market|trade/.test(lower)) return 'markets';
  if (/ai|模型|gpt|claude|llm|agent|agi/.test(lower)) return 'ai-tech';
  return 'other';
}

function extractPredictions(content, sourceDate) {
  const predictions = [];
  const seen = new Set();

  for (const pattern of PREDICTION_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const text = match[1].trim();
      if (text.length < 10 || text.length > 500) continue;
      
      // Deduplicate (normalize whitespace for matching)
      const normText = text.replace(/\s+/g, ' ').trim();
      const key = normText.substring(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);

      // Split multi-line into individual predictions
      const lines = text.split(/\n[-•]\s*/).filter(l => l.trim().length > 10);
      for (const line of lines) {
        const trimmed = line.trim().replace(/^[-•]\s*/, '');
        if (trimmed.length < 10) continue;
        const lineKey = trimmed.replace(/\s+/g, ' ').substring(0, 60);
        if (seen.has(lineKey)) continue;
        seen.add(lineKey);
        predictions.push({
          id: `pred_${sourceDate}_${predictions.length}`,
          date: sourceDate,
          text: trimmed,
          confidence: extractConfidence(trimmed),
          domain: extractDomain(trimmed),
          status: 'pending', // pending | correct | wrong | partial
          scored_at: null,
          outcome_note: null,
        });
      }
    }
  }
  return predictions;
}

// ─── File Scanning ───

function getDailyFiles(fromDate, toDate) {
  const files = [];
  try {
    const entries = fs.readdirSync(MEMORY_DIR);
    for (const entry of entries) {
      const match = entry.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
      if (!match) continue;
      const date = match[1];
      if (fromDate && date < fromDate) continue;
      if (toDate && date > toDate) continue;
      files.push({ date, path: path.join(MEMORY_DIR, entry) });
    }
  } catch (e) { /* empty */ }
  return files.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Scoring ───

function loadScores() {
  try {
    return JSON.parse(fs.readFileSync(SCORES_FILE, 'utf-8'));
  } catch {
    return { predictions: [], meta: { created: new Date().toISOString(), last_updated: null } };
  }
}

function saveScores(data) {
  data.meta.last_updated = new Date().toISOString();
  fs.writeFileSync(SCORES_FILE, JSON.stringify(data, null, 2));
}

function computeBrierScore(predictions) {
  const resolved = predictions.filter(p => p.status !== 'pending');
  if (resolved.length === 0) return null;
  
  let sum = 0;
  for (const p of resolved) {
    const outcome = p.status === 'correct' ? 1 : p.status === 'partial' ? 0.5 : 0;
    sum += Math.pow(p.confidence - outcome, 2);
  }
  return sum / resolved.length;
}

function computeStats(predictions) {
  const resolved = predictions.filter(p => p.status !== 'pending');
  const correct = resolved.filter(p => p.status === 'correct').length;
  const partial = resolved.filter(p => p.status === 'partial').length;
  const wrong = resolved.filter(p => p.status === 'wrong').length;
  const pending = predictions.filter(p => p.status === 'pending').length;
  
  // Domain breakdown
  const domains = {};
  for (const p of resolved) {
    if (!domains[p.domain]) domains[p.domain] = { correct: 0, partial: 0, wrong: 0, total: 0 };
    domains[p.domain].total++;
    domains[p.domain][p.status]++;
  }

  // Calibration buckets
  const calibration = {};
  for (const p of resolved) {
    const bucket = Math.round(p.confidence * 10) / 10;
    if (!calibration[bucket]) calibration[bucket] = { predicted: bucket, actual_hits: 0, total: 0 };
    calibration[bucket].total++;
    if (p.status === 'correct' || p.status === 'partial') calibration[bucket].actual_hits++;
  }
  
  return {
    total: predictions.length,
    resolved: resolved.length,
    pending,
    correct,
    partial,
    wrong,
    hit_rate: resolved.length > 0 ? ((correct + partial * 0.5) / resolved.length) : null,
    brier_score: computeBrierScore(predictions),
    domains,
    calibration,
  };
}

// ─── CLI ───

function formatReport(stats, predictions) {
  const lines = [];
  
  lines.push('╔══════════════════════════════════════════════════╗');
  lines.push('║         Intelligence Retrospective               ║');
  lines.push('╠══════════════════════════════════════════════════╣');
  lines.push(`║ Total predictions: ${String(stats.total).padEnd(30)}║`);
  lines.push(`║ Resolved: ${stats.resolved} | Pending: ${String(stats.pending).padEnd(19)}║`);
  
  if (stats.hit_rate !== null) {
    const hrPct = (stats.hit_rate * 100).toFixed(0);
    lines.push(`║ Hit rate: ${hrPct}% (${stats.correct}✅ ${stats.partial}🔄 ${String(stats.wrong + '❌').padEnd(14)})║`);
  }
  if (stats.brier_score !== null) {
    const bLabel = stats.brier_score < 0.15 ? 'excellent' : stats.brier_score < 0.25 ? 'good' : stats.brier_score < 0.35 ? 'fair' : 'poor';
    lines.push(`║ Brier score: ${stats.brier_score.toFixed(3)} (${String(bLabel + ')').padEnd(22)}║`);
  }
  
  // Domain breakdown
  if (Object.keys(stats.domains).length > 0) {
    lines.push('╠══════════════════════════════════════════════════╣');
    lines.push('║ DOMAIN BREAKDOWN                                 ║');
    for (const [domain, d] of Object.entries(stats.domains)) {
      const rate = d.total > 0 ? ((d.correct + d.partial * 0.5) / d.total * 100).toFixed(0) : '-';
      lines.push(`║ • ${domain}: ${rate}% (${d.correct}/${d.total})`.padEnd(51) + '║');
    }
  }

  // Recent predictions sample
  const recent = predictions.slice(-10);
  if (recent.length > 0) {
    lines.push('╠══════════════════════════════════════════════════╣');
    lines.push('║ RECENT PREDICTIONS                               ║');
    for (const p of recent) {
      const icon = p.status === 'correct' ? '✅' : p.status === 'wrong' ? '❌' : p.status === 'partial' ? '🔄' : '⏳';
      const shortText = p.text.length > 35 ? p.text.substring(0, 35) + '…' : p.text;
      lines.push(`║ ${icon} [${p.date}] ${shortText}`.padEnd(51) + '║');
    }
  }

  lines.push('╚══════════════════════════════════════════════════╝');
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'retro';
  
  const getArg = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
  };
  const hasFlag = (name) => args.includes(`--${name}`);
  const jsonMode = hasFlag('json');
  
  if (command === 'extract') {
    // Extract predictions from a single file
    const file = getArg('file');
    if (!file) { console.error('Usage: node index.js extract --file <path>'); process.exit(1); }
    const content = fs.readFileSync(file, 'utf-8');
    const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : 'unknown';
    const preds = extractPredictions(content, date);
    console.log(jsonMode ? JSON.stringify(preds, null, 2) : `Found ${preds.length} predictions:\n${preds.map(p => `  [${p.domain}] (${(p.confidence*100).toFixed(0)}%) ${p.text}`).join('\n')}`);
    return;
  }
  
  if (command === 'retro') {
    const days = parseInt(getArg('days') || '7', 10);
    const fromDate = getArg('from');
    const toDate = getArg('to');
    
    let from, to;
    if (fromDate && toDate) {
      from = fromDate;
      to = toDate;
    } else {
      const now = new Date();
      to = now.toISOString().split('T')[0];
      const past = new Date(now.getTime() - days * 86400000);
      from = past.toISOString().split('T')[0];
    }
    
    const files = getDailyFiles(from, to);
    if (files.length === 0) {
      console.log(jsonMode ? '{"error":"no files found"}' : `No daily intelligence files found in range ${from} to ${to}`);
      return;
    }
    
    let allPredictions = [];
    for (const f of files) {
      const content = fs.readFileSync(f.path, 'utf-8');
      const preds = extractPredictions(content, f.date);
      allPredictions.push(...preds);
    }
    
    // Merge with existing scores
    const scoreData = loadScores();
    const existingIds = new Set(scoreData.predictions.map(p => p.id));
    let newCount = 0;
    for (const p of allPredictions) {
      if (!existingIds.has(p.id)) {
        scoreData.predictions.push(p);
        newCount++;
      }
    }
    
    if (newCount > 0) {
      saveScores(scoreData);
    }
    
    const stats = computeStats(scoreData.predictions);
    
    if (jsonMode) {
      console.log(JSON.stringify({ stats, predictions: scoreData.predictions, new_extracted: newCount, files_scanned: files.length }, null, 2));
    } else {
      console.log(`Scanned ${files.length} files (${from} → ${to}), extracted ${newCount} new predictions`);
      console.log(`Total tracked: ${scoreData.predictions.length}\n`);
      console.log(formatReport(stats, scoreData.predictions));
    }
    return;
  }
  
  if (command === 'stats') {
    const scoreData = loadScores();
    const stats = computeStats(scoreData.predictions);
    if (jsonMode) {
      console.log(JSON.stringify(stats, null, 2));
    } else {
      console.log(formatReport(stats, scoreData.predictions));
    }
    return;
  }
  
  if (command === 'score') {
    // Manually score a prediction: node index.js score --id pred_xxx --status correct --note "..."
    const id = getArg('id');
    const status = getArg('status');
    const note = getArg('note');
    
    if (!id || !status || !['correct', 'wrong', 'partial', 'pending'].includes(status)) {
      console.error('Usage: node index.js score --id <pred_id> --status correct|wrong|partial|pending [--note "..."]');
      process.exit(1);
    }
    
    const scoreData = loadScores();
    const pred = scoreData.predictions.find(p => p.id === id);
    if (!pred) { console.error(`Prediction ${id} not found`); process.exit(1); }
    
    pred.status = status;
    pred.scored_at = new Date().toISOString();
    if (note) pred.outcome_note = note;
    
    saveScores(scoreData);
    console.log(`Scored ${id}: ${status}${note ? ` (${note})` : ''}`);
    return;
  }
  
  console.log(`
intel-retro — Intelligence Retrospective

Commands:
  retro     Extract & review predictions (default)
            --days N | --from YYYY-MM-DD --to YYYY-MM-DD
  extract   Extract predictions from a single file
            --file <path>
  score     Manually score a prediction
            --id <pred_id> --status correct|wrong|partial|pending [--note "..."]
  stats     Show cumulative accuracy stats

Flags:
  --json    JSON output
`);
}

// Exports for programmatic use
module.exports = { extractPredictions, computeStats, computeBrierScore, loadScores, saveScores, main };

if (require.main === module) {
  main();
}
