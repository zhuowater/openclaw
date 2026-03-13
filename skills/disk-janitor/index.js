'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOME = process.env.HOME || '/root';
const OPENCLAW_DIR = path.join(HOME, 'openclaw');
const DOT_OPENCLAW = path.join(HOME, '.openclaw');

// Default age thresholds in milliseconds
const THRESHOLDS = {
  tmp: 2 * 24 * 3600 * 1000,           // 2 days
  cache: 7 * 24 * 3600 * 1000,         // 7 days
  npmCache: 7 * 24 * 3600 * 1000,      // 7 days
  sessionArchive: 30 * 24 * 3600 * 1000, // 30 days
  gepPrompts: 7 * 24 * 3600 * 1000,    // 7 days
  media: 7 * 24 * 3600 * 1000,         // 7 days
};

// Absolutely never delete these
const PROTECTED_PATTERNS = [
  'MEMORY.md', 'SOUL.md', 'IDENTITY.md', 'AGENTS.md', 'USER.md',
  'HEARTBEAT.md', 'TOOLS.md', '.git', 'node_modules', 'package.json',
  'openclaw.json', '.env',
];

function isProtected(filePath) {
  const base = path.basename(filePath);
  return PROTECTED_PATTERNS.some(p => base === p || filePath.includes(`/${p}/`));
}

function getFilesOlderThan(dir, maxAgeMs, pattern) {
  const now = Date.now();
  const results = [];
  try {
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (isProtected(fullPath)) continue;
      if (pattern && !pattern.test(entry.name)) continue;
      try {
        const stat = fs.statSync(fullPath);
        const age = now - stat.mtimeMs;
        if (age > maxAgeMs) {
          results.push({
            path: fullPath,
            size: entry.isDirectory() ? getDirSize(fullPath) : stat.size,
            ageDays: Math.floor(age / (24 * 3600 * 1000)),
            isDir: entry.isDirectory(),
          });
        }
      } catch (e) { /* skip unreadable */ }
    }
  } catch (e) { /* dir doesn't exist */ }
  return results;
}

function getDirSize(dir) {
  try {
    const output = execSync(`du -sb "${dir}" 2>/dev/null`).toString().trim();
    return parseInt(output.split('\t')[0], 10) || 0;
  } catch { return 0; }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

function getDiskUsage() {
  try {
    const output = execSync("df -B1 / | tail -1").toString().trim();
    const parts = output.split(/\s+/);
    return {
      total: parseInt(parts[1], 10),
      used: parseInt(parts[2], 10),
      avail: parseInt(parts[3], 10),
      percent: parseInt(parts[4], 10),
    };
  } catch { return null; }
}

function scan() {
  const targets = [];

  // 1. /tmp files older than 2 days
  const tmpFiles = getFilesOlderThan('/tmp', THRESHOLDS.tmp);
  if (tmpFiles.length) {
    targets.push({
      category: 'tmp',
      label: '/tmp (stale files)',
      files: tmpFiles,
      totalSize: tmpFiles.reduce((s, f) => s + f.size, 0),
    });
  }

  // 2. ~/.cache sub-directories older than 7 days
  const cacheDir = path.join(HOME, '.cache');
  const cacheFiles = getFilesOlderThan(cacheDir, THRESHOLDS.cache);
  if (cacheFiles.length) {
    targets.push({
      category: 'cache',
      label: '~/.cache (stale entries)',
      files: cacheFiles,
      totalSize: cacheFiles.reduce((s, f) => s + f.size, 0),
    });
  }

  // 3. npm cache
  const npmCacheDir = path.join(HOME, '.npm', '_cacache');
  if (fs.existsSync(npmCacheDir)) {
    const npmSize = getDirSize(npmCacheDir);
    if (npmSize > 50 * 1024 * 1024) { // Only if > 50MB
      targets.push({
        category: 'npmCache',
        label: '~/.npm/_cacache',
        files: [{ path: npmCacheDir, size: npmSize, ageDays: 0, isDir: true }],
        totalSize: npmSize,
        cleanCmd: 'npm cache clean --force',
      });
    }
  }

  // 4. Session archives older than 30 days
  const archiveDir = path.join(DOT_OPENCLAW, 'agents', 'main', 'sessions', 'archive');
  const archiveFiles = getFilesOlderThan(archiveDir, THRESHOLDS.sessionArchive, /\.jsonl$/);
  if (archiveFiles.length) {
    targets.push({
      category: 'sessionArchive',
      label: 'Session archives (>30 days)',
      files: archiveFiles,
      totalSize: archiveFiles.reduce((s, f) => s + f.size, 0),
    });
  }

  // 5. GEP prompt files older than 7 days
  const gepDir = path.join(OPENCLAW_DIR, 'memory', 'evolution');
  const gepFiles = getFilesOlderThan(gepDir, THRESHOLDS.gepPrompts, /^gep_prompt_.*\.txt$/);
  if (gepFiles.length) {
    targets.push({
      category: 'gepPrompts',
      label: 'GEP prompt files (>7 days)',
      files: gepFiles,
      totalSize: gepFiles.reduce((s, f) => s + f.size, 0),
    });
  }

  // 6. Stale inbound media
  const mediaDir = path.join(DOT_OPENCLAW, 'media', 'inbound');
  const mediaFiles = getFilesOlderThan(mediaDir, THRESHOLDS.media);
  if (mediaFiles.length) {
    targets.push({
      category: 'media',
      label: 'Stale inbound media (>7 days)',
      files: mediaFiles,
      totalSize: mediaFiles.reduce((s, f) => s + f.size, 0),
    });
  }

  const grandTotal = targets.reduce((s, t) => s + t.totalSize, 0);
  return { disk: getDiskUsage(), targets, grandTotal };
}

function removeEntry(entry) {
  try {
    if (entry.isDir) {
      fs.rmSync(entry.path, { recursive: true, force: true });
    } else {
      fs.unlinkSync(entry.path);
    }
    return true;
  } catch (e) {
    console.error(`  ✗ Failed to remove ${entry.path}: ${e.message}`);
    return false;
  }
}

function clean() {
  const report = scan();
  let freedBytes = 0;
  let deletedCount = 0;
  const details = [];

  for (const target of report.targets) {
    let categoryFreed = 0;
    let categoryDeleted = 0;

    if (target.cleanCmd) {
      // Special case: npm cache clean
      try {
        execSync(target.cleanCmd, { stdio: 'pipe' });
        categoryFreed = target.totalSize;
        categoryDeleted = 1;
        console.log(`  ✓ ${target.label}: ${formatBytes(categoryFreed)} freed via ${target.cleanCmd}`);
      } catch (e) {
        console.error(`  ✗ ${target.label}: ${e.message}`);
      }
    } else {
      for (const file of target.files) {
        if (removeEntry(file)) {
          categoryFreed += file.size;
          categoryDeleted++;
        }
      }
      if (categoryDeleted > 0) {
        console.log(`  ✓ ${target.label}: ${categoryDeleted} items, ${formatBytes(categoryFreed)} freed`);
      }
    }

    freedBytes += categoryFreed;
    deletedCount += categoryDeleted;
    details.push({
      category: target.category,
      label: target.label,
      deleted: categoryDeleted,
      freed: categoryFreed,
      freedFormatted: formatBytes(categoryFreed),
    });
  }

  const diskAfter = getDiskUsage();
  return {
    freedBytes,
    freedFormatted: formatBytes(freedBytes),
    deletedCount,
    details,
    diskBefore: report.disk,
    diskAfter,
  };
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const doClean = args.includes('--clean');
  const jsonOutput = args.includes('--json');

  if (doClean) {
    console.log('🧹 Disk Janitor — Cleaning...\n');
    const result = clean();
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n━━━ Summary ━━━`);
      console.log(`Freed: ${result.freedFormatted} (${result.deletedCount} items)`);
      if (result.diskAfter) {
        console.log(`Disk: ${result.diskAfter.percent}% used (${formatBytes(result.diskAfter.avail)} available)`);
      }
    }
  } else {
    console.log('🔍 Disk Janitor — Dry Run (add --clean to actually delete)\n');
    const report = scan();
    if (report.disk) {
      console.log(`Disk: ${report.disk.percent}% used (${formatBytes(report.disk.avail)} available)\n`);
    }
    if (report.targets.length === 0) {
      console.log('Nothing to clean! 🎉');
    } else {
      for (const t of report.targets) {
        console.log(`📁 ${t.label}`);
        console.log(`   ${t.files.length} items, ${formatBytes(t.totalSize)} reclaimable`);
        // Show top 3 biggest
        const sorted = [...t.files].sort((a, b) => b.size - a.size);
        for (const f of sorted.slice(0, 3)) {
          console.log(`   - ${path.basename(f.path)} (${formatBytes(f.size)}, ${f.ageDays}d old)`);
        }
        if (sorted.length > 3) console.log(`   ... and ${sorted.length - 3} more`);
        console.log();
      }
      console.log(`━━━ Total reclaimable: ${formatBytes(report.grandTotal)} ━━━`);
    }

    if (jsonOutput) {
      console.log(JSON.stringify(report, null, 2));
    }
  }
}

module.exports = { scan, clean, getDiskUsage, formatBytes, THRESHOLDS };
