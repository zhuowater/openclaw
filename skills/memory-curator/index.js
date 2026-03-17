#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// --- Config ---
const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../..');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const MEMORY_MD = path.join(WORKSPACE, 'MEMORY.md');
const STALE_THRESHOLD_DAYS = parseInt(process.env.CURATOR_STALE_DAYS || '3', 10);

// --- Helpers ---

function parseLastUpdated(content) {
  // Match patterns like "*最后整理: 2026-03-01 09:55*" or "*Last updated: 2026-03-01*"
  const m = content.match(/最后整理[:：]\s*(\d{4}-\d{2}-\d{2})/i)
    || content.match(/last\s+(?:updated|curated)[:：]\s*(\d{4}-\d{2}-\d{2})/i);
  return m ? m[1] : null;
}

function getDailyNotes() {
  if (!fs.existsSync(MEMORY_DIR)) return [];
  return fs.readdirSync(MEMORY_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort();
}

function getDailyNotesSince(dateStr) {
  const notes = getDailyNotes();
  return notes.filter(f => f.replace('.md', '') > dateStr);
}

function readFile(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function extractKeyFacts(content, filename) {
  const facts = [];
  const lines = content.split('\n');
  const date = filename.replace('.md', '');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Extract headers as topic markers
    if (line.startsWith('## ') || line.startsWith('### ')) {
      facts.push({ date, type: 'topic', text: line.replace(/^#+\s*/, '') });
    }
    // Extract key decision/action lines
    if (/(?:决定|决策|决议|结论|关键|重要|新增|完成|发现|学到|教训|注意)/i.test(line)
        || /(?:CRITICAL|IMPORTANT|KEY|TODO|DONE|LEARNED|DECISION)/i.test(line)) {
      if (line.length > 10 && line.length < 500) {
        facts.push({ date, type: 'key_fact', text: line.replace(/^[-*•]\s*/, '') });
      }
    }
    // Extract bullet points with substantive content (>30 chars)
    if (/^[-*•]/.test(line) && line.length > 40) {
      // Skip routine items
      if (!/HEARTBEAT|heartbeat|cron.*executed|session.*started/i.test(line)) {
        facts.push({ date, type: 'detail', text: line.replace(/^[-*•]\s*/, '') });
      }
    }
  }
  return facts;
}

function extractSections(memoryContent) {
  const sections = {};
  let currentSection = null;
  let currentLines = [];

  for (const line of memoryContent.split('\n')) {
    if (line.startsWith('## ')) {
      if (currentSection) sections[currentSection] = currentLines.join('\n');
      currentSection = line.replace(/^##\s*/, '').trim();
      currentLines = [];
    } else if (currentSection) {
      currentLines.push(line);
    }
  }
  if (currentSection) sections[currentSection] = currentLines.join('\n');
  return sections;
}

// --- Commands ---

function checkStaleness() {
  const content = readFile(MEMORY_MD);
  const lastUpdated = parseLastUpdated(content);
  const today = new Date().toISOString().slice(0, 10);

  let daysSinceUpdate = null;
  if (lastUpdated) {
    const diff = new Date(today) - new Date(lastUpdated);
    daysSinceUpdate = Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  const notesSince = lastUpdated ? getDailyNotesSince(lastUpdated) : getDailyNotes();
  let totalBytes = 0;
  for (const n of notesSince) {
    try {
      totalBytes += fs.statSync(path.join(MEMORY_DIR, n)).size;
    } catch {}
  }

  const result = {
    last_updated: lastUpdated || 'unknown',
    today,
    days_stale: daysSinceUpdate,
    needs_update: daysSinceUpdate !== null ? daysSinceUpdate >= STALE_THRESHOLD_DAYS : true,
    daily_notes_since: notesSince.length,
    total_bytes: totalBytes,
    stale_threshold: STALE_THRESHOLD_DAYS,
    notes: notesSince.map(n => n.replace('.md', ''))
  };

  return result;
}

function generateReport() {
  const staleness = checkStaleness();
  const memoryContent = readFile(MEMORY_MD);
  const existingSections = extractSections(memoryContent);

  // Collect all facts from daily notes since last update
  const allFacts = [];
  const noteFiles = staleness.last_updated !== 'unknown'
    ? getDailyNotesSince(staleness.last_updated)
    : getDailyNotes().slice(-7); // fallback: last 7 days

  for (const noteFile of noteFiles) {
    const content = readFile(path.join(MEMORY_DIR, noteFile));
    const facts = extractKeyFacts(content, noteFile);
    allFacts.push(...facts);
  }

  // Categorize facts by topic frequency
  const topicCounts = {};
  for (const f of allFacts) {
    if (f.type === 'topic') {
      topicCounts[f.text] = (topicCounts[f.text] || 0) + 1;
    }
  }

  // Find topics mentioned 2+ times (recurring = important)
  const recurringTopics = Object.entries(topicCounts)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, count]) => ({ topic, count }));

  // Identify key facts (deduped)
  const seen = new Set();
  const uniqueFacts = allFacts.filter(f => {
    if (f.type === 'topic') return false;
    const key = f.text.slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Check which existing MEMORY.md sections might be stale
  const staleSections = [];
  for (const [name, content] of Object.entries(existingSections)) {
    // Check if section references dates older than 2 weeks with no recent updates
    const dateMatches = content.match(/\d{4}-\d{2}-\d{2}/g) || [];
    const latestDate = dateMatches.sort().pop();
    if (latestDate && latestDate < staleness.last_updated) {
      staleSections.push({ section: name, latest_reference: latestDate });
    }
  }

  return {
    staleness,
    recurring_topics: recurringTopics,
    key_facts_count: uniqueFacts.length,
    key_facts_sample: uniqueFacts.slice(0, 20),
    stale_sections: staleSections,
    existing_section_names: Object.keys(existingSections)
  };
}

function generateDiff() {
  const report = generateReport();
  const lines = [];

  lines.push(`# MEMORY.md Curation Diff`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Days stale: ${report.staleness.days_stale}`);
  lines.push(`# Daily notes processed: ${report.staleness.daily_notes_since}`);
  lines.push('');

  // Header update
  lines.push(`[UPDATE] Header`);
  lines.push(`  *最后整理: ${new Date().toISOString().slice(0, 10)} (auto-curated)*`);
  lines.push('');

  // Recurring topics that might need new sections
  if (report.recurring_topics.length > 0) {
    lines.push(`[REVIEW] Recurring topics (appeared ${STALE_THRESHOLD_DAYS}+ times):`);
    for (const t of report.recurring_topics) {
      const inMemory = report.existing_section_names.some(s =>
        s.toLowerCase().includes(t.topic.toLowerCase().slice(0, 10)));
      lines.push(`  - "${t.topic}" (${t.count}x) ${inMemory ? '[already in MEMORY.md]' : '[NEW - consider adding]'}`);
    }
    lines.push('');
  }

  // Key facts to potentially add
  if (report.key_facts_sample.length > 0) {
    lines.push(`[ADD] Key facts from daily notes (${report.key_facts_count} total, showing top 20):`);
    for (const f of report.key_facts_sample) {
      lines.push(`  [${f.date}] ${f.text.slice(0, 120)}`);
    }
    lines.push('');
  }

  // Stale sections
  if (report.stale_sections.length > 0) {
    lines.push(`[REVIEW] Potentially stale sections in MEMORY.md:`);
    for (const s of report.stale_sections) {
      lines.push(`  - "${s.section}" (latest ref: ${s.latest_reference})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// --- Exports ---
module.exports = { checkStaleness, generateReport, generateDiff };

// --- CLI ---
if (require.main === module) {
  const cmd = process.argv[2] || 'check';

  switch (cmd) {
    case 'check':
      console.log(JSON.stringify(checkStaleness(), null, 2));
      break;
    case 'report':
      console.log(JSON.stringify(generateReport(), null, 2));
      break;
    case 'diff':
      console.log(generateDiff());
      break;
    default:
      console.error(`Usage: node index.js [check|report|diff]`);
      process.exit(1);
  }
}
