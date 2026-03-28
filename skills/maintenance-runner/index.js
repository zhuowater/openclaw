#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || '/root/openclaw';
const SKILLS_DIR = path.join(WORKSPACE, 'skills');

// ─── Config ───
const TASKS = [
  {
    id: 'janitor',
    name: 'Memory Janitor',
    description: 'Prune GEP prompts, compact memory graph, archive old notes, clean sessions',
    modulePath: path.join(SKILLS_DIR, 'memory-janitor', 'index.js'),
    run: (mod) => {
      // Capture console output
      const output = captureConsole(() => mod.main());
      return output;
    }
  },
  {
    id: 'compactor',
    name: 'Evo Compactor',
    description: 'Compact evolution data files',
    modulePath: path.join(SKILLS_DIR, 'evo-compactor', 'index.js'),
    run: (mod) => {
      const output = captureConsole(() => mod.main());
      return output;
    }
  },
  {
    id: 'curator-check',
    name: 'Memory Curator Check',
    description: 'Check MEMORY.md staleness',
    modulePath: path.join(SKILLS_DIR, 'memory-curator', 'index.js'),
    run: (mod) => {
      if (typeof mod.checkStaleness === 'function') {
        return mod.checkStaleness();
      }
      return { skipped: true, reason: 'checkStaleness not exported' };
    }
  }
];

// ─── Helpers ───

function captureConsole(fn) {
  const originalLog = console.log;
  const originalError = console.error;
  const lines = [];

  console.log = (...args) => lines.push(args.join(' '));
  console.error = (...args) => lines.push('[ERR] ' + args.join(' '));

  let result;
  try {
    result = fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  return { result, output: lines.join('\n') };
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Main ───

function runMaintenance(options = {}) {
  const { dryRun = true, only = null, json = false } = options;

  const startTime = Date.now();
  const results = [];
  let totalFreed = 0;

  // Filter tasks if --only specified
  const tasksToRun = only
    ? TASKS.filter(t => only.includes(t.id))
    : TASKS;

  for (const task of tasksToRun) {
    const taskStart = Date.now();
    const taskResult = {
      id: task.id,
      name: task.name,
      status: 'ok',
      freedBytes: 0,
      details: null,
      durationMs: 0,
      output: ''
    };

    try {
      // Check if module exists
      if (!fs.existsSync(task.modulePath)) {
        taskResult.status = 'skipped';
        taskResult.details = `Module not found: ${task.modulePath}`;
        results.push(taskResult);
        continue;
      }

      // For janitor and compactor, set env for dry-run vs run mode
      if (!dryRun) {
        // For janitor: it checks process.argv for --dry-run
        // We'll manipulate its globals
        if (task.id === 'janitor') {
          // Remove --dry-run from argv if present, or don't add it
          const origArgv = process.argv.slice();
          process.argv = ['node', 'maintenance-runner'];
          try {
            // Re-require to pick up new argv state
            delete require.cache[require.resolve(task.modulePath)];
            const mod = require(task.modulePath);
            const { result, output } = captureConsole(() => mod.main());
            taskResult.details = result;
            taskResult.output = output;
            taskResult.freedBytes = (result && result.totalFreed) || 0;
          } finally {
            process.argv = origArgv;
          }
        } else if (task.id === 'compactor') {
          const origArgv = process.argv.slice();
          process.argv = ['node', 'maintenance-runner', '--compact'];
          try {
            delete require.cache[require.resolve(task.modulePath)];
            const mod = require(task.modulePath);
            const { result, output } = captureConsole(() => mod.main());
            taskResult.details = result;
            taskResult.output = output;
          } finally {
            process.argv = origArgv;
          }
        } else {
          const mod = require(task.modulePath);
          const outcome = task.run(mod);
          if (outcome && outcome.output !== undefined) {
            taskResult.details = outcome.result;
            taskResult.output = outcome.output;
          } else {
            taskResult.details = outcome;
          }
        }
      } else {
        // Dry run mode
        if (task.id === 'curator-check') {
          const mod = require(task.modulePath);
          taskResult.details = task.run(mod);
        } else {
          // For janitor/compactor in dry-run, just load and run with dry-run defaults
          const origArgv = process.argv.slice();
          process.argv = ['node', 'maintenance-runner', '--dry-run'];
          try {
            delete require.cache[require.resolve(task.modulePath)];
            const mod = require(task.modulePath);
            const { result, output } = captureConsole(() => mod.main());
            taskResult.details = result;
            taskResult.output = output;
          } finally {
            process.argv = origArgv;
          }
        }
      }
    } catch (err) {
      taskResult.status = 'error';
      taskResult.details = err.message;
    }

    taskResult.durationMs = Date.now() - taskStart;
    totalFreed += taskResult.freedBytes || 0;
    results.push(taskResult);
  }

  const totalDuration = Date.now() - startTime;

  const report = {
    timestamp: new Date().toISOString(),
    mode: dryRun ? 'dry-run' : 'execute',
    tasks: results,
    summary: {
      total: results.length,
      ok: results.filter(r => r.status === 'ok').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length,
      totalFreedBytes: totalFreed,
      totalFreed: formatBytes(totalFreed),
      durationMs: totalDuration,
      duration: formatDuration(totalDuration)
    }
  };

  // Check memory staleness for alert
  const curatorResult = results.find(r => r.id === 'curator-check');
  if (curatorResult && curatorResult.details && curatorResult.details.days_stale) {
    report.memoryAlert = {
      daysStale: curatorResult.details.days_stale,
      needsUpdate: curatorResult.details.needs_update,
      unprocessedNotes: curatorResult.details.daily_notes_since,
      lastUpdated: curatorResult.details.last_updated
    };
  }

  return report;
}

// ─── CLI ───

function printReport(report) {
  const mode = report.mode === 'dry-run' ? '🔍 DRY RUN' : '🔧 EXECUTED';
  console.log(`\n${mode} — Maintenance Runner`);
  console.log('═'.repeat(50));

  for (const task of report.tasks) {
    const icon = task.status === 'ok' ? '✅' : task.status === 'skipped' ? '⏭️' : '❌';
    console.log(`\n${icon} ${task.name} (${formatDuration(task.durationMs)})`);

    if (task.status === 'error') {
      console.log(`   Error: ${task.details}`);
    } else if (task.status === 'skipped') {
      console.log(`   Skipped: ${task.details}`);
    } else if (task.output) {
      // Show compact output
      const lines = task.output.split('\n').filter(l => l.trim());
      for (const line of lines.slice(0, 8)) {
        console.log(`   ${line}`);
      }
      if (lines.length > 8) {
        console.log(`   ... (${lines.length - 8} more lines)`);
      }
    }

    if (task.freedBytes > 0) {
      console.log(`   Freed: ${formatBytes(task.freedBytes)}`);
    }
  }

  // Memory alert
  if (report.memoryAlert) {
    const ma = report.memoryAlert;
    if (ma.needsUpdate) {
      console.log(`\n⚠️  MEMORY.md ALERT: ${ma.daysStale} days stale!`);
      console.log(`   Last updated: ${ma.lastUpdated}`);
      console.log(`   Unprocessed daily notes: ${ma.unprocessedNotes}`);
      console.log(`   Run: node skills/memory-curator/index.js report`);
    } else {
      console.log(`\n✅ MEMORY.md is fresh (last updated: ${ma.lastUpdated})`);
    }
  }

  console.log(`\n📊 Summary: ${report.summary.ok} ok / ${report.summary.skipped} skipped / ${report.summary.errors} errors`);
  console.log(`   Total freed: ${report.summary.totalFreed}`);
  console.log(`   Duration: ${report.summary.duration}`);
}

function main() {
  const args = process.argv.slice(2);
  const doRun = args.includes('--run');
  const jsonOutput = args.includes('--json');
  const onlyArg = args.find(a => a.startsWith('--only=') || a.startsWith('--only '));
  let only = null;

  // Parse --only
  const onlyIdx = args.indexOf('--only');
  if (onlyIdx >= 0 && args[onlyIdx + 1]) {
    only = args[onlyIdx + 1].split(',').map(s => s.trim());
  } else if (onlyArg && onlyArg.includes('=')) {
    only = onlyArg.split('=')[1].split(',').map(s => s.trim());
  }

  const report = runMaintenance({
    dryRun: !doRun,
    only,
    json: jsonOutput
  });

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  // Exit with error code if any task failed
  if (report.summary.errors > 0) {
    process.exit(1);
  }
}

// ─── Exports ───

module.exports = { runMaintenance, TASKS };

if (require.main === module) {
  main();
}
