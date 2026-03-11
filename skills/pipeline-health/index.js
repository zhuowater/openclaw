'use strict';

const fs = require('fs');
const path = require('path');

const INTEL_DIR = '/root/openclaw/skills/intelligence';
const FIRMS_DIR = '/root/openclaw/skills/firms-satellite';
const LOGS_DIR = path.join(INTEL_DIR, 'logs');
const DASHBOARD_FILE = path.join(INTEL_DIR, 'dashboard.json');

// Pipeline definitions: name -> { expectedIntervalHours, logPrefix, dataGlob }
const PIPELINES = {
  firms: {
    label: 'FIRMS Satellite',
    expectedIntervalH: 6,
    findData: () => {
      // FIRMS data ends up in intelligence summary files
      const summary = findNewestFileByPrefix(INTEL_DIR, 'intelligence_summary_');
      if (summary) return summary;
      // Fallback: check firms-satellite dir for any data
      return findNewestFile(FIRMS_DIR, /\.(json|csv)$/i);
    },
    findLog: () => null, // FIRMS runs via separate skill
  },
  ioda: {
    label: 'IODA Internet',
    expectedIntervalH: 6,
    findData: () => findNewestFileByPrefix(INTEL_DIR, 'ioda_'),
    findLog: () => findNewestFileByPrefix(LOGS_DIR, 'ioda_'),
  },
  adsb: {
    label: 'ADS-B Flights',
    expectedIntervalH: 4,
    findData: () => findNewestFileByPrefix(INTEL_DIR, 'adsb_') || findNewestFileByPrefix(LOGS_DIR, 'adsb_'),
    findLog: () => findNewestFileByPrefix(LOGS_DIR, 'adsb_'),
  },
  viirs: {
    label: 'VIIRS Nightlights',
    expectedIntervalH: 24,
    findData: () => findNewestFileByPrefix(INTEL_DIR, 'viirs_') || findNewestFileByPrefix(LOGS_DIR, 'viirs_'),
    findLog: () => findNewestFileByPrefix(LOGS_DIR, 'viirs_'),
  },
  trump: {
    label: 'Trump Monitor',
    expectedIntervalH: 24,
    findData: () => findNewestFileByPrefix(INTEL_DIR, 'trump_'),
    findLog: () => findNewestFileByPrefix(LOGS_DIR, 'trump_'),
  },
  fifa: {
    label: 'FIFA Odds',
    expectedIntervalH: 24,
    findData: () => findNewestFileByPrefix(INTEL_DIR, 'fifa_odds_'),
    findLog: () => findNewestFileByPrefix(LOGS_DIR, 'fifa_'),
  },
  ais: {
    label: 'AIS Shipping',
    expectedIntervalH: 6,
    findData: () => findNewestFileByPrefix(INTEL_DIR, 'ais_') || findNewestFileByPrefix(LOGS_DIR, 'ais_'),
    findLog: () => findNewestFileByPrefix(LOGS_DIR, 'ais_'),
  },
};

// --- Helpers ---

function findNewestFileByPrefix(dir, prefix) {
  try {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith(prefix) && !f.endsWith('.py'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return files.length > 0 ? path.join(dir, files[0].name) : null;
  } catch { return null; }
}

function findNewestFile(dir, pattern) {
  try {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir)
      .filter(f => pattern.test(f))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return files.length > 0 ? path.join(dir, files[0].name) : null;
  } catch { return null; }
}

function getFileMtime(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch { return null; }
}

function readLogTail(filePath, lines = 5) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    const allLines = content.trim().split('\n');
    return allLines.slice(-lines).join('\n');
  } catch { return null; }
}

function detectLogErrors(logTail) {
  if (!logTail) return [];
  const errors = [];
  const patterns = [
    /error/i, /traceback/i, /exception/i, /failed/i,
    /timeout/i, /exit\s+(?!0\b)\d+/i, /❌/,
  ];
  for (const line of logTail.split('\n')) {
    for (const p of patterns) {
      if (p.test(line)) {
        errors.push(line.trim().slice(0, 120));
        break;
      }
    }
  }
  return errors;
}

function hoursAgo(ms) {
  return (Date.now() - ms) / (1000 * 60 * 60);
}

function formatAge(ms) {
  const h = hoursAgo(ms);
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  if (h < 48) return `${h.toFixed(1)}h ago`;
  return `${(h / 24).toFixed(1)}d ago`;
}

// --- Core ---

function checkPipeline(name) {
  const def = PIPELINES[name];
  if (!def) return { pipeline: name, status: 'unknown', issue: 'undefined pipeline' };

  const result = {
    pipeline: name,
    label: def.label,
    status: 'unknown',
    score: 0,
    lastData: null,
    lastDataAge: null,
    lastLog: null,
    logErrors: [],
    issue: null,
  };

  // Check data freshness
  const dataFile = def.findData();
  if (dataFile) {
    const mtime = getFileMtime(dataFile);
    if (mtime) {
      result.lastData = new Date(mtime).toISOString();
      result.lastDataAge = formatAge(mtime);
      const ageH = hoursAgo(mtime);
      if (ageH <= def.expectedIntervalH) {
        result.score = 100;
        result.status = 'healthy';
      } else if (ageH <= def.expectedIntervalH * 2) {
        result.score = 60;
        result.status = 'stale';
        result.issue = `data is ${result.lastDataAge} (expected every ${def.expectedIntervalH}h)`;
      } else {
        result.score = 20;
        result.status = 'stale';
        result.issue = `data is ${result.lastDataAge} (expected every ${def.expectedIntervalH}h)`;
      }
    }
  } else {
    result.status = 'error';
    result.score = 0;
    result.issue = 'no data files found';
  }

  // Check logs
  const logFile = def.findLog();
  if (logFile) {
    result.lastLog = path.basename(logFile);
    const tail = readLogTail(logFile);
    result.logErrors = detectLogErrors(tail);
    if (result.logErrors.length > 0 && result.status !== 'error') {
      result.score = Math.max(result.score - 20, 0);
      if (!result.issue) result.issue = 'errors in latest log';
    }
  }

  return result;
}

function checkHealth(options = {}) {
  const pipelineFilter = options.pipeline;
  const names = pipelineFilter
    ? [pipelineFilter].filter(n => PIPELINES[n])
    : Object.keys(PIPELINES);

  const results = names.map(checkPipeline);
  const healthy = results.filter(r => r.status === 'healthy').length;
  const problems = results.filter(r => r.status !== 'healthy');
  const overallScore = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
    : 0;

  // Read dashboard.json for cross-reference
  let dashboard = null;
  try {
    if (fs.existsSync(DASHBOARD_FILE)) {
      dashboard = JSON.parse(fs.readFileSync(DASHBOARD_FILE, 'utf8'));
    }
  } catch { /* ignore */ }

  return {
    timestamp: new Date().toISOString(),
    summary: `${healthy}/${results.length} pipelines healthy`,
    score: overallScore,
    pipelines: results,
    problems,
    dashboardAge: dashboard?.timestamp
      ? formatAge(new Date(dashboard.timestamp).getTime())
      : 'unknown',
  };
}

// --- CLI ---

function formatReport(report) {
  const lines = [];
  lines.push(`📡 Pipeline Health Report`);
  lines.push(`${'═'.repeat(40)}`);
  lines.push(`Score: ${report.score}/100 | ${report.summary}`);
  lines.push(`Dashboard: ${report.dashboardAge}`);
  lines.push('');

  for (const p of report.pipelines) {
    const icon = p.status === 'healthy' ? '✅' : p.status === 'stale' ? '⚠️' : '❌';
    lines.push(`${icon} ${p.label} (${p.pipeline})`);
    lines.push(`   Status: ${p.status} | Score: ${p.score}/100`);
    if (p.lastData) lines.push(`   Last data: ${p.lastDataAge}`);
    if (p.issue) lines.push(`   Issue: ${p.issue}`);
    if (p.logErrors.length > 0) {
      lines.push(`   Log errors:`);
      for (const e of p.logErrors.slice(0, 3)) {
        lines.push(`     - ${e}`);
      }
    }
    lines.push('');
  }

  if (report.problems.length > 0) {
    lines.push('🔧 Action Required:');
    for (const p of report.problems) {
      lines.push(`  - ${p.label}: ${p.issue || p.status}`);
    }
  } else {
    lines.push('✨ All pipelines healthy!');
  }

  return lines.join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const problemsOnly = args.includes('--problems');
  const pipelineIdx = args.indexOf('--pipeline');
  const pipelineName = pipelineIdx >= 0 ? args[pipelineIdx + 1] : null;

  const report = checkHealth({ pipeline: pipelineName });

  if (jsonMode) {
    console.log(JSON.stringify(problemsOnly ? report.problems : report, null, 2));
  } else {
    if (problemsOnly) {
      if (report.problems.length === 0) {
        console.log('✨ All pipelines healthy!');
      } else {
        for (const p of report.problems) {
          const icon = p.status === 'stale' ? '⚠️' : '❌';
          console.log(`${icon} ${p.label}: ${p.issue || p.status}`);
        }
      }
    } else {
      console.log(formatReport(report));
    }
  }
}

module.exports = { checkHealth, checkPipeline, PIPELINES };
