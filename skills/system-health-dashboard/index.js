/**
 * system-health-dashboard - Unified health aggregator
 * Runs all health-check subsystems and produces a single scored report.
 */
const path = require('path');
const { execSync } = require('child_process');

const SKILLS_DIR = path.resolve(__dirname, '..');

// Subsystem definitions: each wraps a health skill's main export
const SUBSYSTEMS = {
  disk: {
    label: 'Disk Usage',
    run: async () => {
      try {
        const { scan, getDiskUsage } = require(path.join(SKILLS_DIR, 'disk-janitor'));
        const usage = getDiskUsage();
        const scanResult = scan ? scan() : null;
        const pctUsed = usage ? usage.usedPct : parseFloat(execSync("df -h / | awk 'NR==2{print $5}'").toString());
        const severity = pctUsed > 90 ? 'critical' : pctUsed > 75 ? 'warn' : 'ok';
        return { severity, pctUsed, details: scanResult || `${pctUsed}% used` };
      } catch (e) {
        return { severity: 'warn', error: e.message };
      }
    }
  },
  workspace: {
    label: 'Workspace Health',
    run: async () => {
      try {
        const wh = require(path.join(SKILLS_DIR, 'workspace-health'));
        const report = typeof wh.fullReport === 'function' ? wh.fullReport() : wh.main ? wh.main() : null;
        if (!report) return { severity: 'ok', details: 'No issues detected' };
        const issues = report.issues || report.warnings || [];
        const severity = issues.length > 5 ? 'critical' : issues.length > 0 ? 'warn' : 'ok';
        return { severity, issueCount: issues.length, details: issues.slice(0, 5) };
      } catch (e) {
        return { severity: 'warn', error: e.message };
      }
    }
  },
  cron: {
    label: 'Cron Jobs',
    run: async () => {
      try {
        const ch = require(path.join(SKILLS_DIR, 'cron-health'));
        const report = typeof ch.main === 'function' ? ch.main() : null;
        if (!report) return { severity: 'ok', details: 'Cron health OK' };
        const stale = report.staleJobs || report.stale || 0;
        const failed = report.failedJobs || report.failed || 0;
        const severity = failed > 0 ? 'critical' : stale > 2 ? 'warn' : 'ok';
        return { severity, stale, failed, total: report.total || 0, details: report };
      } catch (e) {
        return { severity: 'warn', error: e.message };
      }
    }
  },
  pipeline: {
    label: 'Pipeline Health',
    run: async () => {
      try {
        const ph = require(path.join(SKILLS_DIR, 'pipeline-health'));
        const report = typeof ph.checkHealth === 'function' ? ph.checkHealth() : null;
        if (!report) return { severity: 'ok', details: 'Pipelines OK' };
        const unhealthy = (report.results || []).filter(r => r.status !== 'healthy').length;
        const severity = unhealthy > 2 ? 'critical' : unhealthy > 0 ? 'warn' : 'ok';
        return { severity, unhealthy, total: (report.results || []).length, details: report };
      } catch (e) {
        return { severity: 'warn', error: e.message };
      }
    }
  },
  runtime: {
    label: 'Runtime Integrity',
    run: async () => {
      try {
        const ri = require(path.join(SKILLS_DIR, 'runtime-integrity'));
        const report = typeof ri.checkIntegrity === 'function' ? ri.checkIntegrity() : null;
        if (!report) return { severity: 'ok', details: 'Runtime OK' };
        const modified = report.modified || report.changes || 0;
        const severity = modified > 5 ? 'critical' : modified > 0 ? 'warn' : 'ok';
        return { severity, modified, details: report };
      } catch (e) {
        return { severity: 'warn', error: e.message };
      }
    }
  },
  cronErrors: {
    label: 'Cron Error Digest',
    run: async () => {
      try {
        const { digest } = require(path.join(SKILLS_DIR, 'cron-error-digest'));
        const report = digest({ sinceMs: Date.now() - 7 * 86400000 });
        if (!report || report.error) return { severity: 'ok', details: 'No cron error data' };
        const s = report.summary;
        const severity = s.chronicOffenders > 0 ? 'critical' : s.errorRate > 10 ? 'warn' : 'ok';
        return {
          severity,
          errorRate: s.errorRate + '%',
          totalErrors: s.totalErrors,
          chronicOffenders: s.chronicOffenders,
          details: report.chronicOffenders.slice(0, 3),
        };
      } catch (e) {
        return { severity: 'ok', details: 'cron-error-digest not available: ' + e.message };
      }
    }
  },
  skills: {
    label: 'Skill Quality',
    run: async () => {
      try {
        const sg = require(path.join(SKILLS_DIR, 'skill-gap-analyzer'));
        const report = typeof sg.analyze === 'function' ? sg.analyze() : null;
        if (!report) return { severity: 'ok', details: 'Skills OK' };
        const gaps = report.gaps || report.issues || [];
        const severity = gaps.length > 5 ? 'critical' : gaps.length > 0 ? 'warn' : 'ok';
        return { severity, gapCount: gaps.length, details: gaps.slice(0, 5) };
      } catch (e) {
        return { severity: 'warn', error: e.message };
      }
    }
  }
};

const SEVERITY_SCORE = { ok: 100, warn: 60, critical: 20 };
const SEVERITY_ICON = { ok: '✅', warn: '⚠️', critical: '🔴' };

/**
 * Run all subsystems and aggregate results
 * @param {object} [opts] - Options
 * @param {string[]} [opts.only] - Subset of subsystem keys to run
 * @returns {Promise<object>} Aggregated report
 */
async function runAll(opts = {}) {
  const keys = opts.only || Object.keys(SUBSYSTEMS);
  const results = {};
  let totalScore = 0;
  let count = 0;

  for (const key of keys) {
    const sub = SUBSYSTEMS[key];
    if (!sub) continue;
    try {
      results[key] = { label: sub.label, ...(await sub.run()) };
    } catch (e) {
      results[key] = { label: sub.label, severity: 'warn', error: e.message };
    }
    totalScore += SEVERITY_SCORE[results[key].severity] || 60;
    count++;
  }

  const overallScore = count > 0 ? Math.round(totalScore / count) : 0;
  const overallSeverity = overallScore >= 90 ? 'ok' : overallScore >= 60 ? 'warn' : 'critical';

  return {
    timestamp: new Date().toISOString(),
    overallScore,
    overallSeverity,
    subsystems: results,
    summary: formatSummary(overallScore, overallSeverity, results)
  };
}

/**
 * Run a single subsystem
 * @param {string} key - Subsystem key
 * @returns {Promise<object>} Subsystem result
 */
async function runSubsystem(key) {
  const sub = SUBSYSTEMS[key];
  if (!sub) throw new Error(`Unknown subsystem: ${key}. Available: ${Object.keys(SUBSYSTEMS).join(', ')}`);
  return { label: sub.label, ...(await sub.run()) };
}

function formatSummary(score, severity, results) {
  const lines = [`System Health: ${SEVERITY_ICON[severity]} ${score}/100`];
  for (const [key, val] of Object.entries(results)) {
    const icon = SEVERITY_ICON[val.severity] || '❓';
    const extra = val.error ? ` (${val.error})` : '';
    lines.push(`  ${icon} ${val.label}${extra}`);
  }
  return lines.join('\n');
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 && args[onlyIdx + 1] ? args[onlyIdx + 1].split(',') : undefined;

  const report = await runAll({ only });

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(report.summary);
    console.log(`\nTimestamp: ${report.timestamp}`);
  }
  return report;
}

if (require.main === module) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { runAll, runSubsystem, SUBSYSTEMS, main };
