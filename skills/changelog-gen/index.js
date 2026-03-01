/**
 * changelog-gen — Generate structured changelogs from git history
 * 
 * Classifies commits by conventional commit prefixes and outputs
 * grouped, human-readable changelogs in markdown or JSON.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Category definitions with emoji and matching patterns
const CATEGORIES = [
  { key: 'features',      emoji: '✨', label: 'Features',        patterns: [/^feat/i, /^feature/i] },
  { key: 'fixes',         emoji: '🐛', label: 'Bug Fixes',       patterns: [/^fix/i, /^bugfix/i] },
  { key: 'performance',   emoji: '⚡', label: 'Performance',     patterns: [/^perf/i, /^optimize/i] },
  { key: 'docs',          emoji: '📝', label: 'Documentation',   patterns: [/^docs?/i] },
  { key: 'refactor',      emoji: '♻️',  label: 'Refactoring',     patterns: [/^refactor/i] },
  { key: 'security',      emoji: '🔒', label: 'Security',        patterns: [/^security/i, /^sec/i] },
  { key: 'evolution',     emoji: '🧬', label: 'Evolution',       patterns: [/^evolution/i, /^evo/i] },
  { key: 'intelligence',  emoji: '🕵️', label: 'Intelligence',    patterns: [/^intel/i] },
  { key: 'trading',       emoji: '📊', label: 'Trading',         patterns: [/^trading/i, /^trade/i] },
  { key: 'skill',         emoji: '🛠️', label: 'Skills',          patterns: [/^skill/i] },
  { key: 'chore',         emoji: '🔧', label: 'Other Changes',   patterns: [/./] }, // catch-all
];

/**
 * Classify a commit message into a category
 */
function classifyCommit(message) {
  const cleaned = message.replace(/^\[.*?\]\s*/, ''); // strip leading [tag]
  for (const cat of CATEGORIES) {
    if (cat.key === 'chore') continue; // skip catch-all during first pass
    for (const pat of cat.patterns) {
      if (pat.test(cleaned)) return cat.key;
    }
  }
  return 'chore';
}

/**
 * Parse git log output into structured commit objects
 */
function parseGitLog(raw) {
  if (!raw.trim()) return [];
  return raw.trim().split('\n').map(line => {
    // Format: hash|date|author|subject
    const [hash, date, author, ...subjectParts] = line.split('|');
    const subject = subjectParts.join('|'); // handle | in commit messages
    return {
      hash: (hash || '').trim(),
      date: (date || '').trim(),
      author: (author || '').trim(),
      subject: (subject || '').trim(),
      category: classifyCommit((subject || '').trim()),
    };
  }).filter(c => c.hash && c.subject);
}

/**
 * Build git log arguments as array (for execFileSync)
 */
function buildGitArgs(opts) {
  const args = ['log', '--pretty=format:%h|%ai|%an|%s', '--no-merges'];

  if (opts.from && opts.to) {
    args.push(`${opts.from}..${opts.to}`);
  } else if (opts.from) {
    args.push(`${opts.from}..HEAD`);
  } else if (opts.commits) {
    args.push(`-${opts.commits}`);
  } else {
    const since = opts.since || new Date(Date.now() - (opts.days || 7) * 86400000).toISOString().slice(0, 10);
    args.push(`--since=${since}`);
    if (opts.until) args.push(`--until=${opts.until}`);
  }

  return args;
}

/**
 * Group commits by category
 */
function groupByCategory(commits) {
  const groups = {};
  for (const commit of commits) {
    if (!groups[commit.category]) groups[commit.category] = [];
    groups[commit.category].push(commit);
  }
  return groups;
}

/**
 * Render markdown changelog
 */
function renderMarkdown(commits, opts) {
  const grouped = groupByCategory(commits);
  const lines = [];

  // Header
  const now = new Date().toISOString().slice(0, 10);
  lines.push(`# Changelog`);
  lines.push('');
  lines.push(`> Generated on ${now} | ${commits.length} commits`);
  lines.push('');

  // Render each category in order
  for (const cat of CATEGORIES) {
    const items = grouped[cat.key];
    if (!items || items.length === 0) continue;

    lines.push(`## ${cat.emoji} ${cat.label}`);
    lines.push('');
    for (const c of items) {
      const dateStr = c.date.slice(0, 10);
      lines.push(`- \`${c.hash}\` ${c.subject} *(${dateStr})*`);
    }
    lines.push('');
  }

  // Stats
  lines.push('---');
  lines.push(`*Total: ${commits.length} commits across ${Object.keys(grouped).length} categories*`);

  return lines.join('\n');
}

/**
 * Render JSON changelog
 */
function renderJSON(commits) {
  return JSON.stringify({
    generated: new Date().toISOString(),
    total: commits.length,
    categories: groupByCategory(commits),
  }, null, 2);
}

/**
 * Parse CLI arguments
 */
function parseArgs(argv) {
  const opts = { days: 7, format: 'md', group: true };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--days':     opts.days = parseInt(next, 10); i++; break;
      case '--since':    opts.since = next; i++; break;
      case '--until':    opts.until = next; i++; break;
      case '--from':     opts.from = next; i++; break;
      case '--to':       opts.to = next; i++; break;
      case '--commits':  opts.commits = parseInt(next, 10); i++; break;
      case '--output':   opts.output = next; i++; break;
      case '--format':   opts.format = next; i++; break;
      case '--repo':     opts.repo = next; i++; break;
      case '--no-group': opts.group = false; break;
      case '--help': case '-h':
        console.log('Usage: node index.js [--days N] [--since DATE] [--until DATE] [--from REF] [--to REF] [--commits N] [--output FILE] [--format md|json] [--repo PATH]');
        process.exit(0);
    }
  }
  return opts;
}

/**
 * Main entry point
 */
function main(argv) {
  const opts = parseArgs(argv || process.argv);
  const cwd = opts.repo || process.cwd();

  const args = buildGitArgs(opts);
  let raw;
  try {
    raw = require('child_process').execFileSync('git', args, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  } catch (err) {
    console.error(`Error running git: ${err.message}`);
    process.exit(1);
  }

  const commits = parseGitLog(raw);

  if (commits.length === 0) {
    console.log('No commits found for the specified range.');
    return { total: 0, commits: [] };
  }

  const output = opts.format === 'json' ? renderJSON(commits) : renderMarkdown(commits, opts);

  if (opts.output) {
    fs.writeFileSync(opts.output, output, 'utf-8');
    console.log(`Changelog written to ${opts.output} (${commits.length} commits)`);
  } else {
    console.log(output);
  }

  return { total: commits.length, commits };
}

// Export for programmatic use
module.exports = { main, classifyCommit, parseGitLog, groupByCategory, renderMarkdown, renderJSON };

// CLI execution
if (require.main === module) {
  main();
}
