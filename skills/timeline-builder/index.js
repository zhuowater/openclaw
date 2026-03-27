#!/usr/bin/env node
'use strict';

/**
 * timeline-builder — Extract events from memory files and build
 * structured chronological timelines for intelligence analysis.
 *
 * No external dependencies — uses Node.js built-ins only.
 */

const fs = require('fs');
const path = require('path');

// ─── Constants ──────────────────────────────────────────

const MEMORY_DIR = path.resolve(__dirname, '..', '..', 'memory');
const DEFAULT_DAYS = 7;

// Severity keywords (order matters — first match wins)
const SEVERITY_PATTERNS = [
  { level: 'CRITICAL', patterns: [/critical/i, /🔴/,  /紧急/, /严重/, /CISA KEV/i, /RCE/i, /0-?day/i] },
  { level: 'HIGH',     patterns: [/high/i, /🟠/, /重大/, /漏洞/, /CVE-/i, /exploit/i, /攻击/] },
  { level: 'MEDIUM',   patterns: [/medium/i, /🟡/, /注意/, /突破/, /进展/] },
  { level: 'LOW',      patterns: [/low/i, /🟢/, /一般/, /日常/] },
];

// Category keywords
const CATEGORY_PATTERNS = [
  { cat: 'security',    patterns: [/CVE/i, /漏洞/, /安全/, /exploit/i, /malware/i, /勒索/, /DDoS/i, /RCE/i, /攻击/] },
  { cat: 'geopolitics', patterns: [/战争/, /军事/, /导弹/, /停火/, /谈判/, /制裁/, /伊朗/, /Iran/i, /Israel/i, /以色列/, /霍尔木兹/] },
  { cat: 'finance',     patterns: [/Polymarket/i, /交易/, /市场/, /油价/, /stock/i, /crypto/i, /比特币/, /dollar/i] },
  { cat: 'tech',        patterns: [/AI/i, /量子/, /quantum/i, /芯片/, /chip/i, /模型/, /GPU/i, /Nvidia/i, /突破/] },
  { cat: 'evolution',   patterns: [/evolver/i, /GEP/i, /进化/, /capsule/i, /solidify/i, /gene_/] },
  { cat: 'ops',         patterns: [/cron/i, /heartbeat/i, /部署/, /配置/, /proxy/i, /gateway/i] },
];

// ─── Date Helpers ───────────────────────────────────────

function parseDateStr(s) {
  if (!s) return null;
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+08:00`);
}

function dateToStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ─── Event Extraction ───────────────────────────────────

function detectSeverity(text) {
  for (const { level, patterns } of SEVERITY_PATTERNS) {
    if (patterns.some(p => p.test(text))) return level;
  }
  return 'INFO';
}

function detectCategory(text) {
  for (const { cat, patterns } of CATEGORY_PATTERNS) {
    if (patterns.some(p => p.test(text))) return cat;
  }
  return 'general';
}

/**
 * Parse a memory file and extract timestamped events.
 * @param {string} filePath
 * @returns {Array<{date:string, text:string, category:string, severity:string, source:string, section:string}>}
 */
function parseFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const basename = path.basename(filePath, '.md');
  const fileDate = parseDateStr(basename);
  const fileDateStr = fileDate ? dateToStr(fileDate) : basename;

  const lines = content.split('\n');
  const events = [];
  let currentSection = '';
  let currentSeverityHint = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track sections
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    if (h2) {
      currentSection = h2[1].trim();
      // Sections like "🔴 CRITICAL" set severity hint
      if (/CRITICAL/i.test(currentSection)) currentSeverityHint = 'CRITICAL';
      else if (/HIGH/i.test(currentSection)) currentSeverityHint = 'HIGH';
      else if (/MEDIUM/i.test(currentSection)) currentSeverityHint = 'MEDIUM';
      else currentSeverityHint = null;
      continue;
    }
    if (h3) {
      currentSection = h3[1].trim();
      continue;
    }

    // Extract bullet points with meaningful content
    const bullet = line.match(/^[-*]\s+\*?\*?(.+)/);
    if (!bullet) continue;

    let text = bullet[1].trim().replace(/\*\*/g, '').replace(/\*$/,'').trim();
    if (text.length < 10) continue; // Skip short bullets
    if (/^生成时间|^信源|^行动建议|^趋势/.test(text)) continue; // Skip meta lines

    // Check for inline dates like (3/25) or (2026-03-25)
    let eventDate = fileDateStr;
    const inlineDate = text.match(/\((\d{1,2})\/(\d{1,2})\)/);
    const fullInlineDate = text.match(/\((\d{4}-\d{2}-\d{2})\)/);
    if (fullInlineDate) {
      eventDate = fullInlineDate[1];
    } else if (inlineDate && fileDate) {
      const month = String(inlineDate[1]).padStart(2, '0');
      const day = String(inlineDate[2]).padStart(2, '0');
      eventDate = `${fileDate.getFullYear()}-${month}-${day}`;
    }

    const severity = currentSeverityHint || detectSeverity(text);
    const category = detectCategory(text);

    events.push({
      date: eventDate,
      text: text.substring(0, 200), // Truncate long entries
      category,
      severity,
      source: path.basename(filePath),
      section: currentSection,
    });
  }

  return events;
}

/**
 * Build a timeline from memory files.
 * @param {Object} opts
 * @param {string} [opts.from]     - Start date (YYYY-MM-DD)
 * @param {string} [opts.to]       - End date (YYYY-MM-DD)
 * @param {string} [opts.filter]   - Keyword filter
 * @param {number} [opts.days]     - Number of days to look back (default: 7)
 * @param {boolean} [opts.json]    - Output as JSON
 * @param {boolean} [opts.summary] - One-liner mode
 * @returns {Array<object>|string}
 */
function buildTimeline(opts = {}) {
  const fromDate = opts.from ? parseDateStr(opts.from) : daysAgo(opts.days || DEFAULT_DAYS);
  const toDate = opts.to ? parseDateStr(opts.to) : new Date();

  // Find matching memory files
  const files = [];
  if (!fs.existsSync(MEMORY_DIR)) return [];

  for (const fname of fs.readdirSync(MEMORY_DIR)) {
    if (!fname.match(/^\d{4}-\d{2}-\d{2}\.md$/)) continue;
    const fdate = parseDateStr(fname);
    if (!fdate) continue;
    if (fdate >= fromDate && fdate <= toDate) {
      files.push(path.join(MEMORY_DIR, fname));
    }
  }

  // Also include archive files if they exist and date range is wide
  const daySpan = (toDate - fromDate) / (1000 * 60 * 60 * 24);
  if (daySpan > 14) {
    for (const fname of fs.readdirSync(MEMORY_DIR)) {
      if (fname.startsWith('archive-') && fname.endsWith('.md')) {
        files.push(path.join(MEMORY_DIR, fname));
      }
    }
  }

  // Extract all events
  let events = [];
  for (const f of files) {
    events.push(...parseFile(f));
  }

  // Filter by keyword
  if (opts.filter) {
    const re = new RegExp(opts.filter, 'i');
    events = events.filter(e => re.test(e.text) || re.test(e.category) || re.test(e.section));
  }

  // Sort chronologically
  events.sort((a, b) => a.date.localeCompare(b.date) || severityOrder(a.severity) - severityOrder(b.severity));

  // Deduplicate — same date + similar text (first 60 chars)
  const seen = new Set();
  events = events.filter(e => {
    const key = `${e.date}:${e.text.substring(0, 60)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (opts.json) return events;

  // Format as markdown
  return formatTimeline(events, opts.summary);
}

function severityOrder(s) {
  return { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 }[s] || 5;
}

const SEVERITY_EMOJI = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢', INFO: '⚪' };

function formatTimeline(events, summary = false) {
  if (events.length === 0) return 'No events found in the specified range.';

  const lines = [];
  let lastDate = '';

  for (const e of events) {
    if (e.date !== lastDate) {
      if (lastDate) lines.push('');
      lines.push(`### ${e.date}`);
      lastDate = e.date;
    }

    const emoji = SEVERITY_EMOJI[e.severity] || '⚪';
    const tag = `[${e.severity}]`;
    const cat = `[${e.category}]`;

    if (summary) {
      lines.push(`${emoji} ${e.text.substring(0, 80)} ${tag} ${cat}`);
    } else {
      lines.push(`- ${emoji} **${tag}** ${cat} ${e.text}`);
      if (e.section) lines.push(`  _Section: ${e.section}_`);
    }
  }

  const header = `# Timeline (${events.length} events)\n`;
  return header + lines.join('\n');
}

// ─── CLI ────────────────────────────────────────────────

function printUsage() {
  console.log(`Usage: node index.js <command> [options]

Commands:
  build               Build timeline from memory files
  parse <file>        Parse a single file

Options:
  --from YYYY-MM-DD   Start date (default: 7 days ago)
  --to YYYY-MM-DD     End date (default: today)
  --filter <keyword>  Filter events by keyword
  --days <n>          Days to look back (default: 7)
  --json              Output as JSON
  --summary           One-liner per event
  --help              Show this help`);
}

function parseArgs(argv) {
  const opts = {};
  const args = argv.slice(2);
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--from':    opts.from = args[++i]; break;
      case '--to':      opts.to = args[++i]; break;
      case '--filter':  opts.filter = args[++i]; break;
      case '--days':    opts.days = parseInt(args[++i], 10); break;
      case '--json':    opts.json = true; break;
      case '--summary': opts.summary = true; break;
      case '--help':    printUsage(); process.exit(0);
      default:          positional.push(args[i]);
    }
  }
  return { command: positional[0] || 'build', positional, opts };
}

function main() {
  const { command, positional, opts } = parseArgs(process.argv);

  switch (command) {
    case 'build': {
      const result = buildTimeline(opts);
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result);
      }
      break;
    }
    case 'parse': {
      const file = positional[1];
      if (!file) { console.error('Error: file path required'); process.exit(1); }
      const events = parseFile(file);
      console.log(JSON.stringify(events, null, 2));
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

// ─── Exports ────────────────────────────────────────────

module.exports = { buildTimeline, parseFile, parseDateStr, detectSeverity, detectCategory };

// CLI entry
if (require.main === module) {
  main();
}
