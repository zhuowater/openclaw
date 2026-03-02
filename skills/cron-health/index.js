/**
 * cron-health — Monitor and audit OpenClaw cron job health
 * 
 * Lists all cron jobs, checks for staleness, and provides health scoring.
 * Uses the OpenClaw cron API via gateway HTTP endpoints.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

// Gateway defaults
const GATEWAY_PORT = process.env.OPENCLAW_PORT || 4444;
const GATEWAY_HOST = process.env.OPENCLAW_HOST || '127.0.0.1';
const GATEWAY_TOKEN = process.env.OPENCLAW_TOKEN || '';

/**
 * Make an HTTP request to the OpenClaw gateway cron API
 */
function gatewayRequest(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: GATEWAY_HOST,
      port: GATEWAY_PORT,
      path: `/api/cron/${endpoint}`,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    };
    if (GATEWAY_TOKEN) {
      options.headers['Authorization'] = `Bearer ${GATEWAY_TOKEN}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data, status: res.statusCode });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Gateway timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Parse cron expression to estimate interval in ms (rough approximation)
 */
function estimateCronIntervalMs(expr) {
  if (!expr) return null;
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return null;
  
  const [min, hour, dom, mon, dow] = parts;
  
  // Every N minutes
  if (min.startsWith('*/') && hour === '*') {
    return parseInt(min.slice(2)) * 60 * 1000;
  }
  // Specific minute, every hour
  if (/^\d+$/.test(min) && hour === '*') {
    return 60 * 60 * 1000;
  }
  // Specific minute and hour (daily)
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*') {
    return 24 * 60 * 60 * 1000;
  }
  // Multiple hours
  if (/^\d+$/.test(min) && hour.includes(',')) {
    const hours = hour.split(',');
    return (24 / hours.length) * 60 * 60 * 1000;
  }
  // Hour range
  if (/^\d+$/.test(min) && hour.includes('-')) {
    const [start, end] = hour.split('-').map(Number);
    const count = end - start + 1;
    return (24 / count) * 60 * 60 * 1000;
  }
  
  // Default: assume daily
  return 24 * 60 * 60 * 1000;
}

/**
 * Analyze a single job's health
 */
function analyzeJob(job, runs) {
  const now = Date.now();
  const result = {
    id: job.id || job.jobId,
    name: job.name || '(unnamed)',
    enabled: job.enabled !== false,
    schedule: null,
    expectedIntervalMs: null,
    lastRunAt: null,
    lastRunStatus: null,
    staleness: 'ok', // ok | warning | stale | unknown
    issues: [],
  };

  // Parse schedule
  const sched = job.schedule || {};
  if (sched.kind === 'cron') {
    result.schedule = `cron: ${sched.expr}`;
    result.expectedIntervalMs = estimateCronIntervalMs(sched.expr);
  } else if (sched.kind === 'every') {
    result.schedule = `every: ${Math.round(sched.everyMs / 60000)}m`;
    result.expectedIntervalMs = sched.everyMs;
  } else if (sched.kind === 'at') {
    result.schedule = `at: ${sched.at || new Date(sched.atMs).toISOString()}`;
    result.expectedIntervalMs = null; // one-shot
  }

  // Check runs
  if (runs && runs.length > 0) {
    const lastRun = runs[0]; // Assuming sorted by most recent
    result.lastRunAt = lastRun.startedAt || lastRun.createdAt || lastRun.at;
    result.lastRunStatus = lastRun.status || (lastRun.error ? 'failed' : 'success');
    
    // Check staleness
    if (result.expectedIntervalMs && result.lastRunAt) {
      const lastRunTime = new Date(result.lastRunAt).getTime();
      const elapsed = now - lastRunTime;
      const threshold = result.expectedIntervalMs * 2.5; // 2.5x tolerance
      
      if (elapsed > threshold) {
        result.staleness = 'stale';
        result.issues.push(`Last run ${Math.round(elapsed / 60000)}m ago, expected every ${Math.round(result.expectedIntervalMs / 60000)}m`);
      } else if (elapsed > result.expectedIntervalMs * 1.5) {
        result.staleness = 'warning';
        result.issues.push(`Last run ${Math.round(elapsed / 60000)}m ago, slightly delayed`);
      }
    }
    
    if (result.lastRunStatus === 'failed' || result.lastRunStatus === 'error') {
      result.issues.push('Last run failed');
    }
  } else if (result.enabled && sched.kind !== 'at') {
    result.staleness = 'unknown';
    result.issues.push('No run history found');
  }

  if (!result.enabled) {
    result.issues.push('Job is disabled');
  }

  return result;
}

/**
 * Calculate overall health score
 */
function calculateHealthScore(analyses) {
  if (analyses.length === 0) return 100;
  
  let score = 100;
  const enabledJobs = analyses.filter(a => a.enabled);
  
  for (const a of enabledJobs) {
    if (a.staleness === 'stale') score -= 15;
    else if (a.staleness === 'warning') score -= 5;
    else if (a.staleness === 'unknown') score -= 3;
    if (a.lastRunStatus === 'failed' || a.lastRunStatus === 'error') score -= 10;
  }
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Format report as text
 */
function formatReport(analyses, healthScore) {
  const lines = [];
  lines.push('═══════════════════════════════════');
  lines.push(`  Cron Health Report  [Score: ${healthScore}/100]`);
  lines.push('═══════════════════════════════════');
  lines.push('');
  
  const enabled = analyses.filter(a => a.enabled);
  const disabled = analyses.filter(a => !a.enabled);
  const problems = analyses.filter(a => a.issues.length > 0);
  
  lines.push(`Total: ${analyses.length} jobs | Active: ${enabled.length} | Disabled: ${disabled.length} | Problems: ${problems.length}`);
  lines.push('');
  
  if (problems.length > 0) {
    lines.push('⚠️  PROBLEMS:');
    for (const a of problems) {
      const icon = a.staleness === 'stale' ? '🔴' : a.staleness === 'warning' ? '🟡' : '⚪';
      lines.push(`  ${icon} ${a.name} (${a.id})`);
      for (const issue of a.issues) {
        lines.push(`     └─ ${issue}`);
      }
    }
    lines.push('');
  }
  
  lines.push('📋 ALL JOBS:');
  for (const a of analyses) {
    const status = a.enabled ? '✅' : '⏸️';
    const stale = a.staleness === 'stale' ? ' 🔴STALE' : a.staleness === 'warning' ? ' 🟡' : '';
    const lastRun = a.lastRunAt 
      ? `last: ${new Date(a.lastRunAt).toISOString().slice(0, 16)}`
      : 'no runs';
    lines.push(`  ${status} ${a.name}${stale}`);
    lines.push(`     ${a.schedule || 'unknown schedule'} | ${lastRun}`);
  }
  
  lines.push('');
  lines.push(`Report generated: ${new Date().toISOString()}`);
  return lines.join('\n');
}

/**
 * Main entry point
 */
async function main(options = {}) {
  const { json = false, problemsOnly = false } = options;
  
  let jobs = [];
  let jobRuns = {};
  
  try {
    // Try listing jobs via gateway HTTP API
    const listResult = await gatewayRequest('list?includeDisabled=true');
    jobs = listResult.jobs || listResult.items || listResult || [];
    if (!Array.isArray(jobs)) jobs = [];
  } catch (err) {
    // Fallback: read cron state from filesystem if available
    const cronStatePath = path.join(process.env.HOME || '/root', '.openclaw', 'cron-state.json');
    if (fs.existsSync(cronStatePath)) {
      try {
        const state = JSON.parse(fs.readFileSync(cronStatePath, 'utf8'));
        jobs = state.jobs || [];
      } catch { /* ignore */ }
    }
    if (jobs.length === 0) {
      const msg = `Cannot connect to gateway (${GATEWAY_HOST}:${GATEWAY_PORT}): ${err.message}`;
      if (json) {
        console.log(JSON.stringify({ error: msg }));
      } else {
        console.error(msg);
        console.error('Tip: Ensure the OpenClaw gateway is running. Run: openclaw gateway status');
      }
      process.exit(1);
    }
  }
  
  // Get run history for each job (best-effort)
  for (const job of jobs) {
    const jobId = job.id || job.jobId;
    try {
      const runsResult = await gatewayRequest(`runs/${jobId}?limit=3`);
      jobRuns[jobId] = runsResult.runs || runsResult.items || runsResult || [];
      if (!Array.isArray(jobRuns[jobId])) jobRuns[jobId] = [];
    } catch {
      jobRuns[jobId] = [];
    }
  }
  
  // Analyze each job
  const analyses = jobs.map(job => {
    const jobId = job.id || job.jobId;
    return analyzeJob(job, jobRuns[jobId]);
  });
  
  const healthScore = calculateHealthScore(analyses);
  
  // Filter if needed
  const output = problemsOnly ? analyses.filter(a => a.issues.length > 0) : analyses;
  
  if (json) {
    console.log(JSON.stringify({ healthScore, total: analyses.length, jobs: output }, null, 2));
  } else {
    console.log(formatReport(output, healthScore));
  }
  
  return { healthScore, total: analyses.length, jobs: output };
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    json: args.includes('--json'),
    problemsOnly: args.includes('--problems-only'),
  };
  main(options).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = { main, analyzeJob, calculateHealthScore, formatReport, estimateCronIntervalMs };
