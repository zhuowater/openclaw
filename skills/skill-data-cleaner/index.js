#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// ─── Config ────────────────────────────────────────────────────────────
const SKILLS_DIR = path.resolve(__dirname, '..');
const DEFAULT_MAX_AGE_DAYS = 14;

// Extensions considered "data files" (generated output, not source code)
const DATA_EXTENSIONS = new Set(['.json', '.csv', '.log', '.txt']);

// Files that are NEVER stale data (always keep)
const PROTECTED_FILES = new Set([
  'package.json', 'package-lock.json', 'tsconfig.json', 'jsconfig.json',
  '.eslintrc.json', '.prettierrc.json', 'config.json',
  'SKILL.md', 'README.md', 'CHANGELOG.md', 'index.js', 'index.ts',
  '.env', '.gitignore',
]);

// Directories that are never scanned inside a skill
const PROTECTED_DIRS = new Set([
  'node_modules', '.git', 'assets', 'references', 'scripts', 'lib', 'src',
  '__pycache__', '.venv',
]);

// Skills that are never cleaned
const PROTECTED_SKILLS = new Set([
  'evolver', 'feishu-evolver-wrapper', 'feishu-common',
  'feishu-post', 'feishu-card', 'feishu-doc', 'common',
  'clawhub', 'git-sync', 'skill-data-cleaner',
]);

// Filename patterns that indicate generated/report data
const DATA_PATTERNS = [
  /^(fifa_odds|trump_third_term|intelligence_summary)_\d{8}/,
  /^report_\d+/,
  /^scan_\d+/,
  /^snapshot_\d+/,
  /_\d{8}_\d{4,6}\.(json|csv|txt|log)$/,
];

// ─── Core Functions ────────────────────────────────────────────────────

function isDataFile(filePath) {
  const basename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  // Protected files are never data
  if (PROTECTED_FILES.has(basename)) return false;

  // Must be a data extension
  if (!DATA_EXTENSIONS.has(ext)) return false;

  // If it matches a known generated-data pattern, definitely data
  for (const pat of DATA_PATTERNS) {
    if (pat.test(basename)) return true;
  }

  // For .log files, always consider as data
  if (ext === '.log') return true;

  // For .json files, only if they look like generated output (timestamped names)
  if (ext === '.json') {
    // Timestamped filenames are almost certainly generated data
    if (/\d{8}/.test(basename) || /\d{10,}/.test(basename)) return true;
    // Report/scan/dump patterns
    if (/^(report|scan|dump|export|result|output)/i.test(basename)) return true;
    return false;
  }

  // For .csv, always data
  if (ext === '.csv') return true;

  // For .txt, only if timestamped
  if (ext === '.txt') {
    if (/\d{8}/.test(basename) || /\d{10,}/.test(basename)) return true;
    return false;
  }

  return false;
}

function isStale(filePath, maxAgeDays) {
  try {
    const stats = fs.statSync(filePath);
    const ageDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
    return ageDays > maxAgeDays;
  } catch {
    return false;
  }
}

function getFileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function scanSkill(skillDir, opts = {}) {
  const { maxAgeDays = DEFAULT_MAX_AGE_DAYS } = opts;
  const name = path.basename(skillDir);
  const staleFiles = [];
  let totalSizeBytes = 0;

  function walkDir(dir, depth = 0) {
    if (depth > 3) return; // Don't go too deep
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (PROTECTED_DIRS.has(entry.name)) continue;
        // 'logs' directories are scannable for data
        walkDir(fullPath, depth + 1);
      } else if (entry.isFile()) {
        if (isDataFile(fullPath) && isStale(fullPath, maxAgeDays)) {
          const size = getFileSize(fullPath);
          staleFiles.push({
            path: fullPath,
            relativePath: path.relative(skillDir, fullPath),
            size,
            mtime: fs.statSync(fullPath).mtime.toISOString(),
          });
          totalSizeBytes += size;
        }
      }
    }
  }

  walkDir(skillDir);

  return {
    name,
    staleFiles,
    staleCount: staleFiles.length,
    totalSizeBytes,
    totalSizeKB: Math.round(totalSizeBytes / 1024),
  };
}

async function scan(opts = {}) {
  const {
    maxAgeDays = DEFAULT_MAX_AGE_DAYS,
    skillFilter = null,
  } = opts;

  const results = [];
  let totalStale = 0;
  let totalBytes = 0;

  let skillDirs;
  if (skillFilter) {
    const skillPath = path.join(SKILLS_DIR, skillFilter);
    if (fs.existsSync(skillPath)) {
      skillDirs = [{ name: skillFilter, isDirectory: () => true }];
    } else {
      return { skills: [], totalStale: 0, totalSizeKB: 0, error: `Skill "${skillFilter}" not found` };
    }
  } else {
    try {
      skillDirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
        .filter(e => e.isDirectory() && !PROTECTED_SKILLS.has(e.name));
    } catch (e) {
      return { skills: [], totalStale: 0, totalSizeKB: 0, error: e.message };
    }
  }

  for (const entry of skillDirs) {
    const skillPath = skillFilter
      ? path.join(SKILLS_DIR, skillFilter)
      : path.join(SKILLS_DIR, entry.name);

    if (PROTECTED_SKILLS.has(path.basename(skillPath))) continue;

    const result = scanSkill(skillPath, { maxAgeDays });
    if (result.staleCount > 0) {
      results.push(result);
      totalStale += result.staleCount;
      totalBytes += result.totalSizeBytes;
    }
  }

  // Sort by stale count descending
  results.sort((a, b) => b.staleCount - a.staleCount);

  return {
    skills: results,
    totalStale,
    totalSizeKB: Math.round(totalBytes / 1024),
    maxAgeDays,
    scannedAt: new Date().toISOString(),
  };
}

async function clean(opts = {}) {
  const {
    maxAgeDays = DEFAULT_MAX_AGE_DAYS,
    dryRun = true,
    skillFilter = null,
  } = opts;

  const scanResult = await scan({ maxAgeDays, skillFilter });
  const removed = [];
  let freedBytes = 0;

  for (const skill of scanResult.skills) {
    for (const file of skill.staleFiles) {
      if (!dryRun) {
        try {
          fs.unlinkSync(file.path);
          removed.push(file);
          freedBytes += file.size;
        } catch (e) {
          removed.push({ ...file, error: e.message });
        }
      } else {
        removed.push(file);
        freedBytes += file.size;
      }
    }
  }

  return {
    dryRun,
    removed: removed.length,
    freedKB: Math.round(freedBytes / 1024),
    details: removed,
    maxAgeDays,
    cleanedAt: new Date().toISOString(),
  };
}

function report(scanResult) {
  const lines = [];
  lines.push('╔══════════════════════════════════════════╗');
  lines.push('║       Skill Data Cleaner Report          ║');
  lines.push('╚══════════════════════════════════════════╝');
  lines.push('');
  lines.push(`Scanned at: ${scanResult.scannedAt}`);
  lines.push(`Max age threshold: ${scanResult.maxAgeDays} days`);
  lines.push(`Total stale files: ${scanResult.totalStale}`);
  lines.push(`Total reclaimable: ${scanResult.totalSizeKB} KB`);
  lines.push('');

  if (scanResult.skills.length === 0) {
    lines.push('✅ No stale data files found. All clean!');
  } else {
    for (const skill of scanResult.skills) {
      lines.push(`📁 ${skill.name}: ${skill.staleCount} stale files (${skill.totalSizeKB} KB)`);
      // Show top 5 oldest files
      const sorted = [...skill.staleFiles].sort((a, b) =>
        new Date(a.mtime) - new Date(b.mtime)
      );
      const show = sorted.slice(0, 5);
      for (const f of show) {
        const age = Math.round((Date.now() - new Date(f.mtime).getTime()) / (1000 * 60 * 60 * 24));
        lines.push(`   ${f.relativePath} (${Math.round(f.size/1024)}KB, ${age}d old)`);
      }
      if (sorted.length > 5) {
        lines.push(`   ... and ${sorted.length - 5} more`);
      }
      lines.push('');
    }

    lines.push('Run with --clean to remove these files.');
  }

  return lines.join('\n');
}

// ─── CLI ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const flags = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--clean') flags.clean = true;
    else if (args[i] === '--json') flags.json = true;
    else if (args[i].startsWith('--max-age')) {
      const val = args[i].includes('=') ? args[i].split('=')[1] : args[++i];
      flags.maxAgeDays = parseInt(val, 10);
    }
    else if (args[i] === '--skill') {
      flags.skill = args[++i];
    }
  }

  const maxAgeDays = flags.maxAgeDays || DEFAULT_MAX_AGE_DAYS;

  if (flags.clean) {
    const result = await clean({
      maxAgeDays,
      dryRun: false,
      skillFilter: flags.skill,
    });
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`🧹 Cleaned ${result.removed} files, freed ${result.freedKB} KB`);
      for (const d of result.details.slice(0, 10)) {
        console.log(`   ✗ ${path.relative(SKILLS_DIR, d.path)}${d.error ? ' (ERROR: ' + d.error + ')' : ''}`);
      }
      if (result.details.length > 10) {
        console.log(`   ... and ${result.details.length - 10} more`);
      }
    }
  } else {
    const scanResult = await scan({ maxAgeDays, skillFilter: flags.skill });
    if (flags.json) {
      console.log(JSON.stringify(scanResult, null, 2));
    } else {
      console.log(report(scanResult));
    }
  }
}

// ─── Exports ───────────────────────────────────────────────────────────

module.exports = { scan, clean, report, isDataFile, isStale, main };

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
