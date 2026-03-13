#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(process.env.HOME || '/root', '.openclaw/agents/main/sessions');

// ─── Helpers ───

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
  const results = [];
  for (const line of lines) {
    try { results.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return results;
}

function getSessionFiles(daysBack = 1) {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  const cutoff = Date.now() - daysBack * 86400000;
  const files = [];
  const entries = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl'));
  for (const entry of entries) {
    const fp = path.join(SESSIONS_DIR, entry);
    try {
      const stat = fs.statSync(fp);
      if (stat.mtimeMs >= cutoff) files.push({ path: fp, name: entry, mtime: stat.mtimeMs, size: stat.size });
    } catch { /* skip */ }
  }
  return files.sort((a, b) => b.mtime - a.mtime);
}

function classifySession(records) {
  const session = records.find(r => r.type === 'session');
  if (!session) return 'unknown';
  const id = session.id || '';
  if (id.includes(':cron:')) return 'cron';
  if (id.includes(':spawn:') || id.includes('gep_bridge') || id.includes(':sub:')) return 'spawn';
  // Also check custom records for spawn/cron labels
  const custom = records.find(r => r.type === 'custom');
  if (custom && custom.label && (custom.label.includes('cron') || custom.label.includes('gep'))) return 'cron';
  return 'interactive';
}

function extractToolCalls(records) {
  const tools = {};
  const errors = [];
  for (const r of records) {
    if (r.type !== 'message' || !r.message) continue;
    const msg = r.message;
    // Tool calls: assistant messages with toolCall content blocks
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'toolCall') {
          const name = block.name || 'unknown';
          tools[name] = (tools[name] || 0) + 1;
        }
        // Also handle Anthropic format (tool_use)
        if (block.type === 'tool_use') {
          const name = block.name || 'unknown';
          tools[name] = (tools[name] || 0) + 1;
        }
      }
    }
    // Tool results with errors - check toolResult role
    if (msg.role === 'toolResult' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        const text = typeof block === 'string' ? block : (block.text || '');
        if (text.toLowerCase().includes('error') || text.toLowerCase().includes('failed')) {
          errors.push({
            error: text.slice(0, 200),
            timestamp: r.timestamp
          });
        }
      }
    }
  }
  return { tools, errors };
}

function analyzeSession(filePath) {
  const records = readJsonl(filePath);
  if (records.length === 0) return null;

  const sessionType = classifySession(records);
  const messages = records.filter(r => r.type === 'message');
  const timestamps = records.map(r => r.timestamp).filter(Boolean).sort();
  const firstTs = timestamps[0];
  const lastTs = timestamps[timestamps.length - 1];
  const durationMs = firstTs && lastTs ? new Date(lastTs) - new Date(firstTs) : 0;

  const { tools, errors } = extractToolCalls(records);

  const userMsgs = messages.filter(r => r.message?.role === 'user').length;
  const assistantMsgs = messages.filter(r => r.message?.role === 'assistant').length;

  return {
    file: path.basename(filePath),
    sessionType,
    totalRecords: records.length,
    totalMessages: messages.length,
    userMessages: userMsgs,
    assistantMessages: assistantMsgs,
    toolCalls: tools,
    totalToolCalls: Object.values(tools).reduce((a, b) => a + b, 0),
    errors,
    errorCount: errors.length,
    durationMs,
    durationMin: Math.round(durationMs / 60000 * 10) / 10,
    firstTimestamp: firstTs,
    lastTimestamp: lastTs
  };
}

// ─── Public API ───

async function analyze(opts = {}) {
  const days = opts.days || 1;
  const typeFilter = opts.type || null;
  const files = getSessionFiles(days);

  const sessions = [];
  const toolTotals = {};
  let totalMessages = 0;
  let totalErrors = 0;
  let totalDuration = 0;
  const byType = { cron: 0, spawn: 0, interactive: 0, unknown: 0 };

  for (const f of files) {
    const s = analyzeSession(f.path);
    if (!s) continue;
    if (typeFilter && s.sessionType !== typeFilter) continue;

    sessions.push(s);
    totalMessages += s.totalMessages;
    totalErrors += s.errorCount;
    totalDuration += s.durationMs;
    byType[s.sessionType] = (byType[s.sessionType] || 0) + 1;

    for (const [tool, count] of Object.entries(s.toolCalls)) {
      toolTotals[tool] = (toolTotals[tool] || 0) + count;
    }
  }

  return {
    period: `${days} day(s)`,
    sessionsAnalyzed: sessions.length,
    totalMessages,
    totalErrors,
    avgMessagesPerSession: sessions.length ? Math.round(totalMessages / sessions.length * 10) / 10 : 0,
    avgDurationMin: sessions.length ? Math.round(totalDuration / sessions.length / 60000 * 10) / 10 : 0,
    byType,
    toolCalls: toolTotals,
    topSessions: sessions.slice(0, 10).map(s => ({
      file: s.file,
      type: s.sessionType,
      messages: s.totalMessages,
      tools: s.totalToolCalls,
      errors: s.errorCount,
      duration: `${s.durationMin}m`
    }))
  };
}

async function topTools(opts = {}) {
  const report = await analyze(opts);
  return Object.entries(report.toolCalls)
    .sort(([, a], [, b]) => b - a)
    .map(([tool, count]) => ({ tool, count }));
}

async function errorSummary(opts = {}) {
  const days = opts.days || 7;
  const files = getSessionFiles(days);
  const patterns = {};

  for (const f of files) {
    const s = analyzeSession(f.path);
    if (!s || s.errors.length === 0) continue;
    for (const err of s.errors) {
      // Group by first 80 chars of error message
      const key = err.error.slice(0, 80);
      if (!patterns[key]) {
        patterns[key] = { pattern: key, count: 0, sessions: new Set(), lastSeen: null };
      }
      patterns[key].count++;
      patterns[key].sessions.add(s.file);
      if (!patterns[key].lastSeen || err.timestamp > patterns[key].lastSeen) {
        patterns[key].lastSeen = err.timestamp;
      }
    }
  }

  return Object.values(patterns)
    .map(p => ({ ...p, sessions: p.sessions.size }))
    .sort((a, b) => b.count - a.count);
}

// ─── CLI ───

function formatReport(report) {
  const lines = [
    `📊 Session Analysis — ${report.period}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Sessions: ${report.sessionsAnalyzed}`,
    `  Cron: ${report.byType.cron} | Spawn: ${report.byType.spawn} | Interactive: ${report.byType.interactive}`,
    `Messages: ${report.totalMessages} (avg ${report.avgMessagesPerSession}/session)`,
    `Errors: ${report.totalErrors}`,
    `Avg Duration: ${report.avgDurationMin}m`,
    '',
    '🔧 Tool Usage:',
  ];

  const sortedTools = Object.entries(report.toolCalls).sort(([, a], [, b]) => b - a).slice(0, 15);
  for (const [tool, count] of sortedTools) {
    lines.push(`  ${tool}: ${count}`);
  }

  if (report.topSessions.length > 0) {
    lines.push('', '📋 Top Sessions:');
    for (const s of report.topSessions.slice(0, 5)) {
      lines.push(`  [${s.type}] ${s.file.slice(0, 8)}… — ${s.messages} msgs, ${s.tools} tools, ${s.errors} errs, ${s.duration}`);
    }
  }

  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const days = args.includes('--days') ? parseInt(args[args.indexOf('--days') + 1]) || 1 : 1;
  const jsonOut = args.includes('--json');
  const typeFilter = args.includes('--type') ? args[args.indexOf('--type') + 1] : null;
  const showTopTools = args.includes('--top-tools');
  const showErrors = args.includes('--errors');

  if (showTopTools) {
    const tools = await topTools({ days });
    if (jsonOut) { console.log(JSON.stringify(tools, null, 2)); }
    else {
      console.log(`🔧 Top Tools (${days} day(s)):`);
      for (const t of tools.slice(0, 20)) {
        console.log(`  ${t.tool}: ${t.count}`);
      }
    }
    return;
  }

  if (showErrors) {
    const errs = await errorSummary({ days });
    if (jsonOut) { console.log(JSON.stringify(errs, null, 2)); }
    else {
      console.log(`❌ Error Summary (${days} day(s)):`);
      if (errs.length === 0) { console.log('  No errors found.'); return; }
      for (const e of errs.slice(0, 10)) {
        console.log(`  [${e.count}x in ${e.sessions} sessions] ${e.pattern}`);
      }
    }
    return;
  }

  const report = await analyze({ days, type: typeFilter });
  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReport(report));
  }
}

// ─── Exports ───

module.exports = { analyze, topTools, errorSummary, main };

if (require.main === module) {
  main().catch(err => { console.error('Error:', err.message); process.exit(1); });
}
