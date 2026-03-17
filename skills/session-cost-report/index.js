#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(process.env.HOME || '/root', '.openclaw/agents/main/sessions');

// ── CLI args ──
const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--days') flags.days = parseInt(args[++i], 10) || 1;
  else if (args[i] === '--json') flags.json = true;
  else if (args[i] === '--top') flags.top = parseInt(args[++i], 10) || 10;
  else if (args[i] === '--type') flags.type = args[++i];
}

const DAYS = flags.days || 1;
const TOP_N = flags.top || 10;

// ── Helpers ──

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const results = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try { results.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return results;
}

function classifySession(filename, entries) {
  const name = filename.replace('.jsonl', '');
  // Try to identify from system/user messages or session metadata
  for (const e of entries) {
    const msg = e.message || e;
    const role = msg.role || e.role;
    const content = typeof msg.content === 'string' ? msg.content : '';
    // Check type=session metadata
    if (e.type === 'session' && e.kind) {
      if (e.kind === 'cron') return 'cron';
      if (e.kind === 'spawn' || e.kind === 'isolated') return 'spawn';
    }
    if (role === 'system' && content.includes('[cron:')) return 'cron';
    if (role === 'system' && (content.includes('sessions_spawn') || content.includes('sub-agent'))) return 'spawn';
    if (role === 'user' && content.includes('[cron:')) return 'cron';
    // Check metadata
    if (e.sessionMeta) {
      if (e.sessionMeta.kind === 'cron') return 'cron';
      if (e.sessionMeta.kind === 'spawn') return 'spawn';
    }
  }
  // Heuristic: short sessions are likely spawns
  const assistantMsgs = entries.filter(e => (e.message || e).role === 'assistant' || e.role === 'assistant');
  if (assistantMsgs.length <= 3) return 'spawn';
  return 'interactive';
}

function extractCosts(entries) {
  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let model = 'unknown';
  let provider = 'unknown';
  let messageCount = 0;
  let toolCalls = 0;
  let execCalls = 0;

  for (const entry of entries) {
    // Usage/model can be at top level OR nested in entry.message
    const msg = entry.message || entry;
    const usage = msg.usage || entry.usage;
    const msgModel = msg.model || entry.model;
    const msgProvider = msg.provider || entry.provider;
    const content = msg.content || entry.content;
    const role = msg.role || entry.role;

    if (usage) {
      totalInput += usage.input || 0;
      totalOutput += usage.output || 0;
      totalCacheRead += usage.cacheRead || 0;
      totalCacheWrite += usage.cacheWrite || 0;
      if (usage.cost && typeof usage.cost.total === 'number') {
        totalCost += usage.cost.total;
      }
    }
    if (msgModel && msgModel !== 'unknown') model = msgModel;
    if (msgProvider && msgProvider !== 'unknown') provider = msgProvider;
    if (role === 'assistant') messageCount++;

    // Count tool calls
    if (role === 'assistant' && Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'toolCall' || block.type === 'tool_use') {
          toolCalls++;
          if (block.name === 'exec') execCalls++;
        }
      }
    }
  }

  return {
    totalCost,
    totalInput,
    totalOutput,
    totalCacheRead,
    totalCacheWrite,
    totalTokens: totalInput + totalOutput + totalCacheRead + totalCacheWrite,
    model,
    provider,
    messageCount,
    toolCalls,
    execCalls,
  };
}

function getSessionFiles(daysBack) {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  const cutoff = Date.now() - daysBack * 86400000;
  const files = [];
  for (const entry of fs.readdirSync(SESSIONS_DIR)) {
    if (!entry.endsWith('.jsonl')) continue;
    const fp = path.join(SESSIONS_DIR, entry);
    try {
      const stat = fs.statSync(fp);
      if (stat.mtimeMs >= cutoff) {
        files.push({ path: fp, name: entry, mtime: stat.mtimeMs, size: stat.size });
      }
    } catch { /* skip */ }
  }
  return files.sort((a, b) => b.mtime - a.mtime);
}

function formatCost(c) {
  if (c < 0.001) return `$${c.toFixed(6)}`;
  if (c < 0.01) return `$${c.toFixed(4)}`;
  return `$${c.toFixed(3)}`;
}

function formatTokens(t) {
  if (t >= 1000000) return `${(t / 1000000).toFixed(1)}M`;
  if (t >= 1000) return `${(t / 1000).toFixed(1)}K`;
  return String(t);
}

function generateRecommendations(sessions, byType, byModel) {
  const recs = [];

  // Check if opus is used for cron tasks
  const cronSessions = sessions.filter(s => s.type === 'cron');
  const opusCrons = cronSessions.filter(s => s.costs.model.includes('opus'));
  if (opusCrons.length > 3) {
    const opusCronCost = opusCrons.reduce((sum, s) => sum + s.costs.totalCost, 0);
    recs.push({
      severity: 'high',
      message: `${opusCrons.length} cron sessions use Opus (${formatCost(opusCronCost)}). Consider Sonnet for routine cron tasks to save ~60%.`,
    });
  }

  // Check high exec usage
  const highExec = sessions.filter(s => s.costs.execCalls > 10);
  if (highExec.length > 0) {
    recs.push({
      severity: 'medium',
      message: `${highExec.length} session(s) have >10 exec calls. Consolidate commands or use batch scripts to reduce tool overhead.`,
    });
  }

  // Check for very expensive single sessions
  const expensive = sessions.filter(s => s.costs.totalCost > 0.50);
  if (expensive.length > 0) {
    recs.push({
      severity: 'medium',
      message: `${expensive.length} session(s) cost >$0.50 each. Review for optimization opportunities.`,
    });
  }

  // Check cron frequency vs value
  if (cronSessions.length > 20 && byType.cron && byType.cron.cost > 1.0) {
    recs.push({
      severity: 'medium',
      message: `${cronSessions.length} cron sessions in period costing ${formatCost(byType.cron.cost)}. Consider reducing frequency or consolidating similar jobs.`,
    });
  }

  // Spawn cost check
  const spawnSessions = sessions.filter(s => s.type === 'spawn');
  if (spawnSessions.length > 10) {
    const avgSpawnCost = spawnSessions.reduce((s, x) => s + x.costs.totalCost, 0) / spawnSessions.length;
    if (avgSpawnCost > 0.10) {
      recs.push({
        severity: 'low',
        message: `Spawn sessions average ${formatCost(avgSpawnCost)} each. If these are evolver runs, consider less frequent scheduling.`,
      });
    }
  }

  if (recs.length === 0) {
    recs.push({ severity: 'info', message: 'No major cost optimization opportunities detected.' });
  }

  return recs;
}

// ── Main ──

function main() {
  const files = getSessionFiles(DAYS);
  if (files.length === 0) {
    console.log(`No sessions found in last ${DAYS} day(s).`);
    process.exit(0);
  }

  const sessions = [];
  for (const file of files) {
    const entries = readJsonl(file.path);
    if (entries.length === 0) continue;
    const type = classifySession(file.name, entries);
    if (flags.type && type !== flags.type) continue;
    const costs = extractCosts(entries);
    sessions.push({
      name: file.name.replace('.jsonl', ''),
      type,
      costs,
      size: file.size,
      mtime: file.mtime,
      entryCount: entries.length,
    });
  }

  // Aggregate by type
  const byType = {};
  for (const s of sessions) {
    if (!byType[s.type]) byType[s.type] = { count: 0, cost: 0, tokens: 0 };
    byType[s.type].count++;
    byType[s.type].cost += s.costs.totalCost;
    byType[s.type].tokens += s.costs.totalTokens;
  }

  // Aggregate by model
  const byModel = {};
  for (const s of sessions) {
    const m = s.costs.model;
    if (!byModel[m]) byModel[m] = { count: 0, cost: 0, tokens: 0 };
    byModel[m].count++;
    byModel[m].cost += s.costs.totalCost;
    byModel[m].tokens += s.costs.totalTokens;
  }

  const totalCost = sessions.reduce((sum, s) => sum + s.costs.totalCost, 0);
  const totalTokens = sessions.reduce((sum, s) => sum + s.costs.totalTokens, 0);

  // Sort by cost descending
  sessions.sort((a, b) => b.costs.totalCost - a.costs.totalCost);

  const recommendations = generateRecommendations(sessions, byType, byModel);

  if (flags.json) {
    console.log(JSON.stringify({
      period: { days: DAYS, sessions: sessions.length },
      totals: { cost: totalCost, tokens: totalTokens },
      byType,
      byModel,
      topSessions: sessions.slice(0, TOP_N).map(s => ({
        name: s.name,
        type: s.type,
        cost: s.costs.totalCost,
        model: s.costs.model,
        tokens: s.costs.totalTokens,
        toolCalls: s.costs.toolCalls,
        execCalls: s.costs.execCalls,
      })),
      recommendations,
    }, null, 2));
    return;
  }

  // Text report
  const lines = [];
  lines.push(`═══ Session Cost Report (Last ${DAYS} day${DAYS > 1 ? 's' : ''}) ═══`);
  lines.push('');
  lines.push(`💰 TOTAL: ${formatCost(totalCost)} across ${sessions.length} sessions (${formatTokens(totalTokens)} tokens)`);
  lines.push('');

  // By type
  lines.push('📊 BY TYPE:');
  const typeEntries = Object.entries(byType).sort((a, b) => b[1].cost - a[1].cost);
  for (const [type, data] of typeEntries) {
    const pct = totalCost > 0 ? ((data.cost / totalCost) * 100).toFixed(0) : '0';
    lines.push(`  ${type.padEnd(14)} ${formatCost(data.cost).padStart(8)} (${pct}%) — ${data.count} sessions, ${formatTokens(data.tokens)} tokens`);
  }
  lines.push('');

  // By model
  lines.push('🤖 BY MODEL:');
  const modelEntries = Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost);
  for (const [model, data] of modelEntries) {
    const pct = totalCost > 0 ? ((data.cost / totalCost) * 100).toFixed(0) : '0';
    lines.push(`  ${model.padEnd(24)} ${formatCost(data.cost).padStart(8)} (${pct}%) — ${data.count} sessions`);
  }
  lines.push('');

  // Top spenders
  const topN = sessions.slice(0, TOP_N);
  lines.push(`🏆 TOP ${Math.min(TOP_N, topN.length)} EXPENSIVE:`);
  for (let i = 0; i < topN.length; i++) {
    const s = topN[i];
    lines.push(`  ${String(i + 1).padStart(2)}. ${s.name.substring(0, 40).padEnd(40)} ${formatCost(s.costs.totalCost).padStart(8)}  (${s.costs.model}, ${formatTokens(s.costs.totalTokens)} tok, ${s.costs.toolCalls} tools, ${s.costs.execCalls} exec)`);
  }
  lines.push('');

  // Recommendations
  lines.push('💡 RECOMMENDATIONS:');
  const icons = { high: '🔴', medium: '🟡', low: '🟢', info: 'ℹ️' };
  for (const rec of recommendations) {
    lines.push(`  ${icons[rec.severity] || '•'} ${rec.message}`);
  }

  console.log(lines.join('\n'));
}

module.exports = { main, extractCosts, classifySession, generateRecommendations };

if (require.main === module) main();
