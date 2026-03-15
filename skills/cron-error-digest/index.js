/**
 * cron-error-digest — Deep analysis of cron job run logs
 * 
 * Unlike cron-health (which checks last-run status), this skill digs into
 * the full run history (.jsonl files) to find chronic failures, timeout
 * patterns, error frequency trends, and recurring issues.
 * 
 * Addresses: log_error + capability_gap signals
 */

const fs = require('fs');
const path = require('path');

const CRON_RUNS_DIR = path.join(process.env.HOME || '/root', '.openclaw/cron/runs');

/**
 * Parse a single cron run log file and extract error entries
 * @param {string} filePath - Path to .jsonl file
 * @returns {object} { jobId, totalRuns, errors[], timeouts, lastError, firstRun, lastRun }
 */
function parseRunLog(filePath) {
  const jobId = path.basename(filePath, '.jsonl');
  const result = {
    jobId,
    totalRuns: 0,
    successCount: 0,
    errorCount: 0,
    timeoutCount: 0,
    errors: [],
    firstRunTs: null,
    lastRunTs: null,
    lastError: null,
    avgDurationMs: 0,
  };

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return { ...result, parseError: e.message };
  }

  const lines = content.split('\n').filter(Boolean);
  let totalDuration = 0;
  let durationCount = 0;

  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.action === 'finished') {
      result.totalRuns++;
      const ts = entry.ts || entry.runAtMs;

      if (ts) {
        if (!result.firstRunTs || ts < result.firstRunTs) result.firstRunTs = ts;
        if (!result.lastRunTs || ts > result.lastRunTs) result.lastRunTs = ts;
      }

      if (entry.durationMs) {
        totalDuration += entry.durationMs;
        durationCount++;
      }

      if (entry.status === 'error' || entry.status === 'failed') {
        result.errorCount++;
        const errMsg = entry.error || 'unknown error';
        const isTimeout = /timed?\s*out/i.test(errMsg);
        if (isTimeout) result.timeoutCount++;

        result.errors.push({
          ts,
          error: errMsg.substring(0, 200),
          isTimeout,
          durationMs: entry.durationMs || null,
        });

        result.lastError = {
          ts,
          error: errMsg.substring(0, 200),
          isTimeout,
        };
      } else {
        result.successCount++;
      }
    }
  }

  result.avgDurationMs = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;
  return result;
}

/**
 * Scan all cron run logs and produce a digest
 * @param {object} [opts] - Options
 * @param {number} [opts.sinceMs] - Only consider errors after this timestamp
 * @param {number} [opts.minErrors] - Minimum errors to include in report (default: 1)
 * @returns {object} Full digest report
 */
function digest(opts = {}) {
  const sinceMs = opts.sinceMs || 0;
  const minErrors = opts.minErrors || 1;

  if (!fs.existsSync(CRON_RUNS_DIR)) {
    return { error: 'Cron runs directory not found', dir: CRON_RUNS_DIR };
  }

  const files = fs.readdirSync(CRON_RUNS_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => path.join(CRON_RUNS_DIR, f));

  const jobs = [];
  let totalErrors = 0;
  let totalTimeouts = 0;
  let totalRuns = 0;

  for (const file of files) {
    const parsed = parseRunLog(file);
    totalRuns += parsed.totalRuns;
    totalErrors += parsed.errorCount;
    totalTimeouts += parsed.timeoutCount;

    // Filter by sinceMs if specified
    if (sinceMs > 0 && parsed.errors.length > 0) {
      parsed.errors = parsed.errors.filter(e => e.ts >= sinceMs);
      parsed.errorCount = parsed.errors.length;
      parsed.timeoutCount = parsed.errors.filter(e => e.isTimeout).length;
    }

    if (parsed.errorCount >= minErrors) {
      jobs.push(parsed);
    }
  }

  // Sort by error count descending
  jobs.sort((a, b) => b.errorCount - a.errorCount);

  // Identify chronic offenders (>50% failure rate)
  const chronic = jobs.filter(j => j.totalRuns > 2 && j.errorCount / j.totalRuns > 0.5);

  // Identify timeout-heavy jobs
  const timeoutHeavy = jobs.filter(j => j.timeoutCount > 2);

  // Error frequency by day (last 7 days)
  const now = Date.now();
  const dayBuckets = {};
  for (let i = 0; i < 7; i++) {
    const dayStart = now - (i + 1) * 86400000;
    const dayEnd = now - i * 86400000;
    const dayKey = new Date(dayEnd).toISOString().split('T')[0];
    dayBuckets[dayKey] = 0;
  }
  for (const job of jobs) {
    for (const err of job.errors) {
      if (!err.ts) continue;
      for (const [dayKey, _] of Object.entries(dayBuckets)) {
        const dayStart = new Date(dayKey + 'T00:00:00Z').getTime();
        const dayEnd = dayStart + 86400000;
        if (err.ts >= dayStart && err.ts < dayEnd) {
          dayBuckets[dayKey]++;
        }
      }
    }
  }

  // Extract unique error patterns
  const errorPatterns = {};
  for (const job of jobs) {
    for (const err of job.errors) {
      // Normalize error message to a pattern
      const pattern = err.error
        .replace(/\d{10,}/g, '<ts>')
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-/g, '<uuid-')
        .substring(0, 100);
      if (!errorPatterns[pattern]) {
        errorPatterns[pattern] = { count: 0, jobs: new Set(), sample: err.error };
      }
      errorPatterns[pattern].count++;
      errorPatterns[pattern].jobs.add(job.jobId);
    }
  }

  // Convert patterns for output
  const patterns = Object.entries(errorPatterns)
    .map(([pat, info]) => ({
      pattern: pat,
      count: info.count,
      affectedJobs: info.jobs.size,
      sample: info.sample,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    timestamp: new Date().toISOString(),
    summary: {
      totalJobs: files.length,
      totalRuns,
      totalErrors,
      totalTimeouts,
      errorRate: totalRuns > 0 ? Math.round((totalErrors / totalRuns) * 100) : 0,
      chronicOffenders: chronic.length,
      timeoutHeavyJobs: timeoutHeavy.length,
    },
    chronicOffenders: chronic.map(j => ({
      jobId: j.jobId,
      totalRuns: j.totalRuns,
      errorCount: j.errorCount,
      timeoutCount: j.timeoutCount,
      failureRate: Math.round((j.errorCount / j.totalRuns) * 100),
      lastError: j.lastError,
      avgDurationMs: j.avgDurationMs,
    })),
    timeoutHeavy: timeoutHeavy.map(j => ({
      jobId: j.jobId,
      timeoutCount: j.timeoutCount,
      totalRuns: j.totalRuns,
      avgDurationMs: j.avgDurationMs,
    })),
    errorTrend: dayBuckets,
    topErrorPatterns: patterns,
    problematicJobs: jobs.slice(0, 15).map(j => ({
      jobId: j.jobId,
      totalRuns: j.totalRuns,
      errorCount: j.errorCount,
      successCount: j.successCount,
      timeoutCount: j.timeoutCount,
      lastError: j.lastError,
    })),
  };
}

/**
 * Format digest as human-readable text
 * @param {object} report - Output from digest()
 * @returns {string}
 */
function formatText(report) {
  if (report.error) return `Error: ${report.error}`;

  const s = report.summary;
  const lines = [
    `📊 Cron Error Digest (${report.timestamp})`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Jobs: ${s.totalJobs} | Runs: ${s.totalRuns} | Errors: ${s.totalErrors} (${s.errorRate}%) | Timeouts: ${s.totalTimeouts}`,
    `Chronic offenders: ${s.chronicOffenders} | Timeout-heavy: ${s.timeoutHeavyJobs}`,
    '',
  ];

  if (report.chronicOffenders.length > 0) {
    lines.push('🔴 Chronic Offenders (>50% failure rate):');
    for (const j of report.chronicOffenders) {
      lines.push(`  ${j.jobId.substring(0, 8)}... — ${j.failureRate}% failures (${j.errorCount}/${j.totalRuns}), ${j.timeoutCount} timeouts`);
      if (j.lastError) lines.push(`    Last: ${j.lastError.error}`);
    }
    lines.push('');
  }

  if (report.topErrorPatterns.length > 0) {
    lines.push('📋 Top Error Patterns:');
    for (const p of report.topErrorPatterns.slice(0, 5)) {
      lines.push(`  [${p.count}x, ${p.affectedJobs} job(s)] ${p.sample.substring(0, 80)}`);
    }
    lines.push('');
  }

  if (Object.keys(report.errorTrend).length > 0) {
    lines.push('📈 Error Trend (last 7 days):');
    const sorted = Object.entries(report.errorTrend).sort();
    for (const [day, count] of sorted) {
      const bar = '█'.repeat(Math.min(count, 40));
      lines.push(`  ${day}: ${bar} ${count}`);
    }
  }

  return lines.join('\n');
}

/**
 * CLI and programmatic entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const sinceArg = args.find(a => a.startsWith('--since='));
  const sinceMs = sinceArg ? new Date(sinceArg.split('=')[1]).getTime() : 0;

  const report = digest({ sinceMs });

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatText(report));
  }

  return report;
}

if (require.main === module) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { digest, formatText, parseRunLog, main };
