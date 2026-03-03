'use strict';

const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.resolve(__dirname, '../../memory');
const GEP_EVENTS = path.resolve(__dirname, '../evolver/assets/gep/events.jsonl');

/**
 * Parse a memory/YYYY-MM-DD.md file into structured sections
 */
function parseMemoryFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const sections = [];
  let currentSection = null;

  for (const line of lines) {
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    if (h2 || h3) {
      if (currentSection) sections.push(currentSection);
      currentSection = { title: (h2 || h3)[1], level: h2 ? 2 : 3, lines: [] };
    } else if (currentSection) {
      currentSection.lines.push(line);
    }
  }
  if (currentSection) sections.push(currentSection);
  return { filePath, sections, raw: content, lineCount: lines.length };
}

/**
 * Extract pending/TODO items from memory content
 */
function extractPendingItems(parsed) {
  if (!parsed) return [];
  const items = [];
  const todoPattern = /- \[ \] (.+)/g;
  let match;
  while ((match = todoPattern.exec(parsed.raw)) !== null) {
    items.push(match[1].trim());
  }
  return items;
}

/**
 * Extract topic keywords from section titles
 */
function extractTopics(parsedFiles) {
  const topics = {};
  for (const pf of parsedFiles) {
    if (!pf) continue;
    for (const sec of pf.sections) {
      const normalized = sec.title.toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, ' ').trim();
      if (normalized) {
        topics[normalized] = (topics[normalized] || 0) + 1;
      }
    }
  }
  return Object.entries(topics)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, count]) => ({ topic, count }));
}

/**
 * Load GEP evolution events for a date range
 */
function loadEvolutionEvents(startDate, endDate) {
  if (!fs.existsSync(GEP_EVENTS)) return [];
  const events = [];
  const lines = fs.readFileSync(GEP_EVENTS, 'utf-8').split('\n').filter(l => l.trim());
  
  for (const line of lines) {
    try {
      const evt = JSON.parse(line);
      if (evt.type !== 'EvolutionEvent') continue;
      // Extract timestamp from event id (evt_<timestamp>)
      const tsMatch = evt.id && evt.id.match(/evt_(\d+)/);
      if (!tsMatch) continue;
      const ts = parseInt(tsMatch[1]);
      const evtDate = new Date(ts);
      if (evtDate >= startDate && evtDate <= endDate) {
        events.push({
          id: evt.id,
          intent: evt.intent || 'unknown',
          signals: (evt.signals || []).slice(0, 3),
          genes: evt.genes_used || [],
          outcome: evt.outcome ? evt.outcome.status : 'unknown',
          score: evt.outcome ? evt.outcome.score : 0,
          blastRadius: evt.blast_radius || { files: 0, lines: 0 },
          timestamp: evtDate.toISOString()
        });
      }
    } catch (e) {
      // skip malformed lines
    }
  }
  return events;
}

/**
 * Get date range for N days back from today
 */
function getDateRange(days) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

/**
 * Format date as YYYY-MM-DD
 */
function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Get raw statistics for a period
 */
function getStats(days = 1) {
  const { start, end } = getDateRange(days);
  const parsedFiles = [];
  const allPending = [];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = fmtDate(d);
    const filePath = path.join(MEMORY_DIR, `${dateStr}.md`);
    const parsed = parseMemoryFile(filePath);
    if (parsed) {
      parsedFiles.push(parsed);
      allPending.push(...extractPendingItems(parsed));
    }
  }

  const topics = extractTopics(parsedFiles);
  const evoEvents = loadEvolutionEvents(start, end);
  
  const totalEntries = parsedFiles.reduce((sum, pf) => sum + pf.sections.length, 0);
  const totalLines = parsedFiles.reduce((sum, pf) => sum + pf.lineCount, 0);

  const intentCounts = {};
  const outcomeCounts = { success: 0, failed: 0, unknown: 0 };
  for (const evt of evoEvents) {
    intentCounts[evt.intent] = (intentCounts[evt.intent] || 0) + 1;
    outcomeCounts[evt.outcome] = (outcomeCounts[evt.outcome] || 0) + 1;
  }

  return {
    period: { start: fmtDate(start), end: fmtDate(end), days },
    totalEntries,
    totalLines,
    filesFound: parsedFiles.length,
    topicBreakdown: topics.slice(0, 15),
    evolutionCycles: {
      total: evoEvents.length,
      intentBreakdown: intentCounts,
      outcomes: outcomeCounts,
      events: evoEvents
    },
    pendingItems: [...new Set(allPending)]
  };
}

/**
 * Generate formatted digest
 */
function generateDigest(options = {}) {
  const { days = 1, includeEvolution = true, format = 'markdown' } = options;
  const stats = getStats(days);

  if (format === 'json') return stats;

  // Build markdown
  const lines = [];
  const title = days === 1
    ? `📋 Activity Digest — ${stats.period.start}`
    : `📋 Activity Digest — ${stats.period.start} ~ ${stats.period.end} (${days} days)`;
  
  lines.push(`# ${title}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push(`- **Memory files found:** ${stats.filesFound}`);
  lines.push(`- **Total sections:** ${stats.totalEntries}`);
  lines.push(`- **Total content lines:** ${stats.totalLines}`);
  lines.push('');

  // Topics
  if (stats.topicBreakdown.length > 0) {
    lines.push('## Top Topics');
    for (const { topic, count } of stats.topicBreakdown.slice(0, 10)) {
      lines.push(`- **${topic}** (×${count})`);
    }
    lines.push('');
  }

  // Evolution
  if (includeEvolution && stats.evolutionCycles.total > 0) {
    const evo = stats.evolutionCycles;
    lines.push('## Evolution Activity');
    lines.push(`- **Total cycles:** ${evo.total}`);
    lines.push(`- **Success:** ${evo.outcomes.success || 0} | **Failed:** ${evo.outcomes.failed || 0}`);
    
    if (Object.keys(evo.intentBreakdown).length > 0) {
      lines.push('- **Intents:** ' + Object.entries(evo.intentBreakdown)
        .map(([k, v]) => `${k}=${v}`).join(', '));
    }
    lines.push('');

    if (evo.events.length > 0) {
      lines.push('### Recent Cycles');
      for (const evt of evo.events.slice(-5)) {
        const status = evt.outcome === 'success' ? '✅' : '❌';
        lines.push(`- ${status} \`${evt.intent}\` — ${evt.signals.join(', ')} (score: ${evt.score})`);
      }
      lines.push('');
    }
  }

  // Pending items
  if (stats.pendingItems.length > 0) {
    lines.push('## Pending Items');
    for (const item of stats.pendingItems) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);
  const daysIdx = args.indexOf('--days');
  const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1]) || 1 : 1;
  const json = args.includes('--json');

  const result = generateDigest({ days, format: json ? 'json' : 'markdown' });
  console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
}

module.exports = { generateDigest, getStats };
