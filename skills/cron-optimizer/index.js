#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const path = require('path');

// --- Config ---
const CONFLICT_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
const CLUSTER_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const CLUSTER_THRESHOLD = 3; // max jobs in a cluster window
const QUIET_START = 23; // 23:00
const QUIET_END = 8;   // 08:00
const SIMULATE_HOURS = 24;

// --- Helpers ---
function getCronJobs() {
  try {
    const raw = execSync(
      'openclaw cron list --json 2>/dev/null || echo "[]"',
      { encoding: 'utf8', timeout: 15000 }
    ).trim();
    // Try to parse JSON from the output
    const lines = raw.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(lines[i]);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && parsed.jobs) return parsed.jobs;
        if (parsed && parsed.items) return parsed.items;
      } catch {}
    }
    // Try full output
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && parsed.jobs) return parsed.jobs;
      if (parsed && parsed.items) return parsed.items;
    } catch {}
    return [];
  } catch {
    return [];
  }
}

function parseCronExpression(expr) {
  // Basic cron interval estimation (minutes between runs)
  // Supports: */N, specific values, ranges
  if (!expr) return null;
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return null;

  const [minute, hour] = parts;
  
  // */N minutes
  if (minute.startsWith('*/')) {
    const interval = parseInt(minute.slice(2));
    if (hour === '*') return interval;
    // Specific hours with interval minutes
    const hours = parseField(hour, 0, 23);
    return interval; // approximate
  }
  
  // Specific minutes, every hour
  if (hour === '*') {
    const mins = parseField(minute, 0, 59);
    if (mins.length === 1) return 60; // once per hour
    if (mins.length > 1) return 60 / mins.length;
  }

  // Specific hours
  const hours = parseField(hour, 0, 23);
  const mins = parseField(minute, 0, 59);
  if (hours.length > 0 && mins.length > 0) {
    // runs hours.length * mins.length times per day
    const runsPerDay = hours.length * mins.length;
    return (24 * 60) / runsPerDay;
  }

  return 60; // fallback: assume hourly
}

function parseField(field, min, max) {
  if (field === '*') {
    return Array.from({ length: max - min + 1 }, (_, i) => i + min);
  }
  const values = new Set();
  for (const part of field.split(',')) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      for (let i = a; i <= b; i++) values.add(i);
    } else if (part.startsWith('*/')) {
      const step = parseInt(part.slice(2));
      for (let i = min; i <= max; i += step) values.add(i);
    } else {
      values.add(parseInt(part));
    }
  }
  return [...values].sort((a, b) => a - b);
}

function getNextFireTimes(job, hours) {
  const now = Date.now();
  const end = now + hours * 60 * 60 * 1000;
  const times = [];
  const schedule = job.schedule || {};

  if (schedule.kind === 'every' && schedule.everyMs) {
    const anchor = schedule.anchorMs || now;
    let next = anchor;
    while (next < now) next += schedule.everyMs;
    while (next < end) {
      times.push(next);
      next += schedule.everyMs;
    }
  } else if (schedule.kind === 'cron' && schedule.expr) {
    // Approximate: use interval estimation
    const intervalMin = parseCronExpression(schedule.expr);
    if (intervalMin) {
      const intervalMs = intervalMin * 60 * 1000;
      let next = now;
      while (next < end) {
        times.push(next);
        next += intervalMs;
      }
    }
  } else if (schedule.kind === 'at') {
    const at = schedule.atMs || (schedule.at ? new Date(schedule.at).getTime() : 0);
    if (at > now && at < end) times.push(at);
  }

  return times;
}

function getJobInterval(job) {
  const schedule = job.schedule || {};
  if (schedule.kind === 'every' && schedule.everyMs) {
    return schedule.everyMs;
  }
  if (schedule.kind === 'cron' && schedule.expr) {
    const min = parseCronExpression(schedule.expr);
    return min ? min * 60 * 1000 : null;
  }
  return null;
}

function estimateCostLevel(job) {
  const interval = getJobInterval(job);
  if (!interval) return 'one-shot';
  const runsPerDay = (24 * 60 * 60 * 1000) / interval;
  if (runsPerDay > 20) return 'HIGH';
  if (runsPerDay > 8) return 'MEDIUM';
  return 'LOW';
}

function isQuietHour(timestamp) {
  const date = new Date(timestamp);
  const hour = date.getHours();
  return hour >= QUIET_START || hour < QUIET_END;
}

function formatTime(ms) {
  return new Date(ms).toLocaleString('zh-CN', { 
    timeZone: 'Asia/Shanghai',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatMs(ms) {
  if (ms >= 3600000) return `${(ms / 3600000).toFixed(1)}h`;
  if (ms >= 60000) return `${(ms / 60000).toFixed(0)}min`;
  return `${(ms / 1000).toFixed(0)}s`;
}

// --- Analysis ---
function analyze(jobs, simulateHours) {
  const enabledJobs = jobs.filter(j => j.enabled !== false);
  const result = {
    total: jobs.length,
    enabled: enabledJobs.length,
    disabled: jobs.length - enabledJobs.length,
    conflicts: [],
    clusters: [],
    quietHourJobs: [],
    costProjection: [],
    recommendations: [],
    timeline: []
  };

  // Calculate fire times for simulation
  const jobFireTimes = enabledJobs.map(j => ({
    job: j,
    name: j.name || j.id || j.jobId || 'unnamed',
    times: getNextFireTimes(j, simulateHours),
    interval: getJobInterval(j),
    cost: estimateCostLevel(j)
  }));

  // Detect conflicts (two jobs firing within CONFLICT_WINDOW_MS)
  for (let i = 0; i < jobFireTimes.length; i++) {
    for (let j = i + 1; j < jobFireTimes.length; j++) {
      const a = jobFireTimes[i];
      const b = jobFireTimes[j];
      let conflictCount = 0;
      for (const ta of a.times) {
        for (const tb of b.times) {
          if (Math.abs(ta - tb) < CONFLICT_WINDOW_MS) {
            conflictCount++;
          }
        }
      }
      if (conflictCount > 0) {
        result.conflicts.push({
          jobA: a.name,
          jobB: b.name,
          conflictsIn24h: conflictCount,
          suggestion: `Stagger by ${Math.ceil(CONFLICT_WINDOW_MS / 60000)}+ minutes`
        });
      }
    }
  }

  // Detect clusters
  const allFires = [];
  for (const jft of jobFireTimes) {
    for (const t of jft.times) {
      allFires.push({ time: t, name: jft.name });
    }
  }
  allFires.sort((a, b) => a.time - b.time);

  for (let i = 0; i < allFires.length; i++) {
    const windowEnd = allFires[i].time + CLUSTER_WINDOW_MS;
    const cluster = [allFires[i]];
    for (let j = i + 1; j < allFires.length && allFires[j].time < windowEnd; j++) {
      cluster.push(allFires[j]);
    }
    if (cluster.length >= CLUSTER_THRESHOLD) {
      const names = [...new Set(cluster.map(c => c.name))];
      if (names.length >= CLUSTER_THRESHOLD) {
        result.clusters.push({
          time: formatTime(allFires[i].time),
          jobCount: names.length,
          jobs: names,
          suggestion: 'Spread jobs across this window to reduce resource contention'
        });
      }
    }
  }
  // Deduplicate clusters (keep first per 30min window)
  const seen = new Set();
  result.clusters = result.clusters.filter(c => {
    const key = c.time.slice(0, 5);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Quiet hour violations
  for (const jft of jobFireTimes) {
    const quietFires = jft.times.filter(isQuietHour);
    if (quietFires.length > 0) {
      result.quietHourJobs.push({
        name: jft.name,
        quietFireCount: quietFires.length,
        suggestion: 'Consider deferring to active hours (08:00-23:00) unless urgent'
      });
    }
  }

  // Cost projection
  for (const jft of jobFireTimes) {
    const runsPerDay = jft.interval ? (24 * 60 * 60 * 1000) / jft.interval : 0;
    result.costProjection.push({
      name: jft.name,
      interval: jft.interval ? formatMs(jft.interval) : 'one-shot',
      runsPerDay: Math.round(runsPerDay * 10) / 10,
      costLevel: jft.cost,
      schedule: describeSchedule(jft.job)
    });
  }

  // Timeline (first 12 hours, hourly buckets)
  for (let h = 0; h < Math.min(simulateHours, 12); h++) {
    const bucketStart = Date.now() + h * 3600000;
    const bucketEnd = bucketStart + 3600000;
    const fires = allFires.filter(f => f.time >= bucketStart && f.time < bucketEnd);
    if (fires.length > 0) {
      result.timeline.push({
        hour: formatTime(bucketStart),
        count: fires.length,
        jobs: [...new Set(fires.map(f => f.name))]
      });
    }
  }

  // Recommendations
  if (result.conflicts.length > 0) {
    result.recommendations.push({
      priority: 'HIGH',
      action: `${result.conflicts.length} scheduling conflict(s) detected. Stagger job times to avoid resource contention.`
    });
  }
  if (result.clusters.length > 0) {
    result.recommendations.push({
      priority: 'MEDIUM',
      action: `${result.clusters.length} time cluster(s) with ${CLUSTER_THRESHOLD}+ jobs. Consider spreading jobs evenly.`
    });
  }
  if (result.quietHourJobs.length > 0) {
    result.recommendations.push({
      priority: 'LOW',
      action: `${result.quietHourJobs.length} job(s) fire during quiet hours (23:00-08:00). Review if needed.`
    });
  }
  const highCostJobs = result.costProjection.filter(c => c.costLevel === 'HIGH');
  if (highCostJobs.length > 0) {
    result.recommendations.push({
      priority: 'MEDIUM',
      action: `${highCostJobs.length} high-frequency job(s): ${highCostJobs.map(j => j.name).join(', ')}. Consider reducing frequency if not critical.`
    });
  }
  if (result.recommendations.length === 0) {
    result.recommendations.push({
      priority: 'INFO',
      action: 'Scheduling looks healthy. No conflicts or clusters detected.'
    });
  }

  return result;
}

function describeSchedule(job) {
  const s = job.schedule || {};
  if (s.kind === 'every') return `every ${formatMs(s.everyMs)}`;
  if (s.kind === 'cron') return `cron: ${s.expr}${s.tz ? ' (' + s.tz + ')' : ''}`;
  if (s.kind === 'at') return `once at ${s.at || new Date(s.atMs).toISOString()}`;
  return 'unknown';
}

function formatReport(analysis) {
  const lines = [];
  lines.push('╔══════════════════════════════════════╗');
  lines.push('║       CRON OPTIMIZER REPORT          ║');
  lines.push('╚══════════════════════════════════════╝');
  lines.push('');
  lines.push(`Jobs: ${analysis.enabled} enabled / ${analysis.disabled} disabled / ${analysis.total} total`);
  lines.push('');

  // Cost projection
  lines.push('── Cost Projection ──');
  for (const cp of analysis.costProjection) {
    const icon = cp.costLevel === 'HIGH' ? '🔴' : cp.costLevel === 'MEDIUM' ? '🟡' : '🟢';
    lines.push(`  ${icon} ${cp.name}: ${cp.schedule} (${cp.runsPerDay} runs/day) [${cp.costLevel}]`);
  }
  lines.push('');

  // Conflicts
  if (analysis.conflicts.length > 0) {
    lines.push('── ⚠️  Conflicts ──');
    for (const c of analysis.conflicts) {
      lines.push(`  ${c.jobA} ↔ ${c.jobB}: ${c.conflictsIn24h} conflicts/24h → ${c.suggestion}`);
    }
    lines.push('');
  }

  // Clusters
  if (analysis.clusters.length > 0) {
    lines.push('── 📊 Clusters ──');
    for (const c of analysis.clusters) {
      lines.push(`  ${c.time}: ${c.jobCount} jobs [${c.jobs.join(', ')}]`);
    }
    lines.push('');
  }

  // Quiet hours
  if (analysis.quietHourJobs.length > 0) {
    lines.push('── 🌙 Quiet Hour Activity ──');
    for (const q of analysis.quietHourJobs) {
      lines.push(`  ${q.name}: ${q.quietFireCount} fires during 23:00-08:00`);
    }
    lines.push('');
  }

  // Timeline
  if (analysis.timeline.length > 0) {
    lines.push('── 📅 Next 12h Timeline ──');
    for (const t of analysis.timeline) {
      const bar = '█'.repeat(Math.min(t.count, 20));
      lines.push(`  ${t.hour} ${bar} (${t.count}) ${t.jobs.join(', ')}`);
    }
    lines.push('');
  }

  // Recommendations
  lines.push('── 💡 Recommendations ──');
  for (const r of analysis.recommendations) {
    const icon = r.priority === 'HIGH' ? '🔴' : r.priority === 'MEDIUM' ? '🟡' : r.priority === 'LOW' ? '🔵' : 'ℹ️';
    lines.push(`  ${icon} [${r.priority}] ${r.action}`);
  }

  return lines.join('\n');
}

// --- Main ---
function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const conflictsOnly = args.includes('--conflicts');
  let simulateHours = SIMULATE_HOURS;

  const simIdx = args.indexOf('--simulate');
  if (simIdx !== -1 && args[simIdx + 1]) {
    simulateHours = parseInt(args[simIdx + 1]) || SIMULATE_HOURS;
  }

  const jobs = getCronJobs();
  if (jobs.length === 0) {
    console.log(jsonMode ? JSON.stringify({ error: 'No cron jobs found or unable to list' }) : 'No cron jobs found. Is openclaw running?');
    process.exit(1);
  }

  const analysis = analyze(jobs, simulateHours);

  if (jsonMode) {
    console.log(JSON.stringify(analysis, null, 2));
  } else if (conflictsOnly) {
    if (analysis.conflicts.length === 0) {
      console.log('No scheduling conflicts detected ✅');
    } else {
      for (const c of analysis.conflicts) {
        console.log(`⚠️  ${c.jobA} ↔ ${c.jobB}: ${c.conflictsIn24h} conflicts/24h`);
      }
    }
  } else {
    console.log(formatReport(analysis));
  }
}

// Exports for programmatic use
module.exports = { analyze, getCronJobs, getNextFireTimes, parseCronExpression };

if (require.main === module) {
  main();
}
