const fs = require('fs').promises;
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execFileAsync = promisify(execFile);

/**
 * Git Status - Get repository status without spawning shell
 * @param {string} cwd - Working directory (default: /root/openclaw)
 * @returns {Promise<Object>} - { clean, staged, modified, untracked }
 */
async function gitStatus(cwd = '/root/openclaw') {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd });
    const lines = stdout.trim().split('\n').filter(Boolean);
    
    const status = {
      clean: lines.length === 0,
      staged: [],
      modified: [],
      untracked: []
    };
    
    for (const line of lines) {
      const code = line.substring(0, 2);
      const file = line.substring(3);
      
      if (code[0] !== ' ' && code[0] !== '?') status.staged.push(file);
      if (code[1] === 'M' || code[0] === 'M') status.modified.push(file);
      if (code === '??') status.untracked.push(file);
    }
    
    return status;
  } catch (err) {
    throw new Error(`gitStatus failed: ${err.message}`);
  }
}

/**
 * Git Log - Get recent commits
 * @param {number} count - Number of commits (default: 5)
 * @param {string} cwd - Working directory
 * @returns {Promise<Array>} - Array of { hash, message, author, date }
 */
async function gitLog(count = 5, cwd = '/root/openclaw') {
  try {
    const { stdout } = await execFileAsync('git', [
      'log',
      `--oneline`,
      `-n`, String(count),
      '--pretty=format:%H|%s|%an|%ai'
    ], { cwd });
    
    return stdout.trim().split('\n').map(line => {
      const [hash, message, author, date] = line.split('|');
      return { hash: hash.substring(0, 7), message, author, date };
    });
  } catch (err) {
    throw new Error(`gitLog failed: ${err.message}`);
  }
}

/**
 * Git Diff Stats - Get diff summary
 * @param {string} cwd - Working directory
 * @returns {Promise<Object>} - { files, insertions, deletions }
 */
async function gitDiff(cwd = '/root/openclaw') {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--stat'], { cwd });
    const match = stdout.match(/(\d+) files? changed(?:, (\d+) insertions?)?(?:, (\d+) deletions?)?/);
    
    if (!match) return { files: 0, insertions: 0, deletions: 0 };
    
    return {
      files: parseInt(match[1]) || 0,
      insertions: parseInt(match[2]) || 0,
      deletions: parseInt(match[3]) || 0
    };
  } catch (err) {
    throw new Error(`gitDiff failed: ${err.message}`);
  }
}

/**
 * File Exists - Check if file exists
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>}
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Directory Size - Get total size of directory
 * @param {string} dirPath - Directory path
 * @returns {Promise<Object>} - { bytes, human }
 */
async function dirSize(dirPath) {
  try {
    const { stdout } = await execFileAsync('du', ['-sb', dirPath]);
    const bytes = parseInt(stdout.split('\t')[0]);
    
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return {
      bytes,
      human: `${size.toFixed(1)}${units[unitIndex]}`
    };
  } catch (err) {
    throw new Error(`dirSize failed: ${err.message}`);
  }
}

/**
 * Find Files - Find files matching pattern
 * @param {string} dir - Directory to search
 * @param {string} pattern - Glob pattern (e.g., "*.js")
 * @param {Object} options - { limit: number }
 * @returns {Promise<Array<string>>}
 */
async function findFiles(dir, pattern, options = {}) {
  const { limit = 100 } = options;
  
  try {
    const { stdout } = await execFileAsync('find', [
      dir,
      '-name', pattern,
      '-type', 'f',
      '-print0'
    ], { maxBuffer: 1024 * 1024 });
    
    const files = stdout.split('\0').filter(Boolean);
    return files.slice(0, limit);
  } catch (err) {
    throw new Error(`findFiles failed: ${err.message}`);
  }
}

/**
 * Read Lines - Read specific lines from file
 * @param {string} filePath - File to read
 * @param {Object} options - { start: number, count: number }
 * @returns {Promise<Array<string>>}
 */
async function readLines(filePath, options = {}) {
  const { start = 1, count = 10 } = options;
  
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    return lines.slice(start - 1, start - 1 + count);
  } catch (err) {
    throw new Error(`readLines failed: ${err.message}`);
  }
}

/**
 * Process Info - Get process information
 * @param {string} pattern - Process name pattern
 * @returns {Promise<Array>} - Array of { pid, cpu, mem, command }
 */
async function processInfo(pattern) {
  try {
    const { stdout } = await execFileAsync('ps', ['aux']);
    const lines = stdout.split('\n').slice(1); // Skip header
    
    const processes = [];
    for (const line of lines) {
      if (!line.includes(pattern)) continue;
      
      const parts = line.trim().split(/\s+/);
      if (parts.length < 11) continue;
      
      processes.push({
        pid: parseInt(parts[1]),
        cpu: parseFloat(parts[2]),
        mem: parseFloat(parts[3]),
        command: parts.slice(10).join(' ')
      });
    }
    
    return processes;
  } catch (err) {
    throw new Error(`processInfo failed: ${err.message}`);
  }
}

/**
 * Batch Exec - Run multiple independent commands in a single call
 * Reduces repeated exec tool usage by combining commands.
 * @param {Array<string|{cmd:string,cwd?:string,label?:string}>} commands
 * @param {Object} options - { cwd: string, timeout: number, stopOnError: boolean }
 * @returns {Promise<Object>} - { results: Array<{label,cmd,ok,stdout,stderr,exitCode}>, summary: string }
 */
async function batchExec(commands, options = {}) {
  const { cwd = '/root/openclaw', timeout = 30000, stopOnError = false } = options;
  const results = [];
  let failed = 0;

  for (let i = 0; i < commands.length; i++) {
    const entry = typeof commands[i] === 'string'
      ? { cmd: commands[i], cwd, label: `cmd_${i}` }
      : { cwd, label: `cmd_${i}`, ...commands[i] };

    try {
      const { stdout, stderr } = await execFileAsync('sh', ['-c', entry.cmd], {
        cwd: entry.cwd,
        timeout,
        maxBuffer: 1024 * 1024
      });
      results.push({
        label: entry.label,
        cmd: entry.cmd,
        ok: true,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0
      });
    } catch (err) {
      failed++;
      results.push({
        label: entry.label,
        cmd: entry.cmd,
        ok: false,
        stdout: (err.stdout || '').trim(),
        stderr: (err.stderr || err.message || '').trim(),
        exitCode: err.code || 1
      });
      if (stopOnError) break;
    }
  }

  return {
    results,
    summary: `${results.length} commands: ${results.length - failed} ok, ${failed} failed`
  };
}

/**
 * System Health - Quick health check combining multiple diagnostics
 * Replaces 4-5 separate exec calls for system status.
 * @returns {Promise<Object>} - { uptime, memory, disk, nodeProcesses, gitStatus }
 */
async function systemHealth() {
  const checks = await batchExec([
    { cmd: 'cat /proc/uptime | cut -d" " -f1', label: 'uptime' },
    { cmd: 'free -m | awk \'NR==2{printf "%d/%dMB (%.1f%%)", $3, $2, $3*100/$2}\'', label: 'memory' },
    { cmd: 'df -h / | awk \'NR==2{printf "%s/%s (%s used)", $3, $2, $5}\'', label: 'disk' },
    { cmd: 'pgrep -c node 2>/dev/null || echo 0', label: 'nodeProcs' },
    { cmd: 'cd /root/openclaw && git status --porcelain | wc -l', label: 'gitDirty' }
  ]);

  const get = (label) => {
    const r = checks.results.find(r => r.label === label);
    return r && r.ok ? r.stdout : 'N/A';
  };

  const uptimeSec = parseFloat(get('uptime')) || 0;
  const uptimeHours = (uptimeSec / 3600).toFixed(1);

  return {
    uptime: `${uptimeHours}h`,
    memory: get('memory'),
    disk: get('disk'),
    nodeProcesses: parseInt(get('nodeProcs')) || 0,
    gitDirtyFiles: parseInt(get('gitDirty')) || 0
  };
}

/**
 * Skill Health - Check if a skill directory has required files
 * @param {string} skillName - Skill directory name
 * @returns {Promise<Object>} - { name, hasIndex, hasSkillMd, hasPkg, importable, issues }
 */
async function skillHealth(skillName) {
  const skillDir = path.join('/root/openclaw/skills', skillName);
  const result = {
    name: skillName,
    hasIndex: false,
    hasSkillMd: false,
    hasPkg: false,
    importable: false,
    issues: []
  };

  try {
    await fs.access(path.join(skillDir, 'index.js'));
    result.hasIndex = true;
  } catch { result.issues.push('missing index.js'); }

  try {
    await fs.access(path.join(skillDir, 'SKILL.md'));
    result.hasSkillMd = true;
  } catch { result.issues.push('missing SKILL.md'); }

  try {
    await fs.access(path.join(skillDir, 'package.json'));
    result.hasPkg = true;
  } catch { /* optional */ }

  if (result.hasIndex) {
    try {
      const { stdout } = await execFileAsync('node', [
        '-e', `try { require('${skillDir}'); console.log('ok') } catch(e) { console.error(e.message); process.exit(1) }`
      ], { timeout: 5000 });
      result.importable = stdout.trim() === 'ok';
    } catch (err) {
      result.importable = false;
      result.issues.push(`import error: ${(err.stderr || err.message).trim().slice(0, 100)}`);
    }
  }

  return result;
}

/**
 * Evolver Preflight - Single-call pre-check for GEP evolution cycles.
 * Replaces 5-7 separate exec calls that evolver sessions typically make.
 * @returns {Promise<Object>} - Combined pre-flight report
 */
async function evolverPreflight() {
  const results = {};

  // 1. System health
  results.system = await systemHealth();

  // 2. Git status
  results.git = await gitStatus();

  // 3. Recent commits (last 3)
  results.recentCommits = await gitLog(3);

  // 4. Diff stats (if dirty)
  if (!results.git.clean) {
    results.diff = await gitDiff();
  }

  // 5. Disk space warning
  const diskMatch = results.system.disk.match(/([\d.]+)%/);
  const diskPct = diskMatch ? parseFloat(diskMatch[1]) : 0;
  results.diskWarning = diskPct > 80 ? `⚠️ Disk at ${diskPct}%` : null;

  // 6. Evolution assets size
  const evolverAssetsDir = '/root/openclaw/skills/evolver/assets/gep';
  try {
    results.assetsSize = await dirSize(evolverAssetsDir);
  } catch {
    results.assetsSize = { human: 'N/A' };
  }

  // 7. Events count
  try {
    const eventsContent = await fs.readFile(
      path.join(evolverAssetsDir, 'events.jsonl'), 'utf8'
    );
    results.eventCount = eventsContent.trim().split('\n').filter(Boolean).length;
  } catch {
    results.eventCount = 0;
  }

  // Summary
  results.ready = !results.diskWarning && results.system.nodeProcesses > 0;
  results.summary = results.ready
    ? `✅ Ready: ${results.eventCount} events, ${results.assetsSize.human} assets, ${results.system.uptime} uptime`
    : `⚠️ Issues detected: ${results.diskWarning || 'check details'}`;

  return results;
}

/**
 * Memory Stats - Consolidated memory/notes statistics in a single call.
 * Replaces: ls memory/ + wc -l MEMORY.md + du -sh memory/ + stat + count
 * @param {string} workspace - Root workspace path (default: /root/openclaw)
 * @returns {Promise<Object>} - { memoryMd, dailyNotes, archives, totalSize, recentNotes, staleCount }
 */
async function memoryStats(workspace = '/root/openclaw') {
  const memDir = path.join(workspace, 'memory');
  const result = {
    memoryMd: { exists: false, lines: 0, bytes: 0, lastModified: null },
    dailyNotes: [],
    archives: [],
    totalSize: { bytes: 0, human: '0B' },
    recentNotes: [],
    staleCount: 0,
    summary: ''
  };

  // 1. MEMORY.md stats
  try {
    const memPath = path.join(workspace, 'MEMORY.md');
    const stat = await fs.stat(memPath);
    const content = await fs.readFile(memPath, 'utf8');
    result.memoryMd = {
      exists: true,
      lines: content.split('\n').length,
      bytes: stat.size,
      lastModified: stat.mtime.toISOString()
    };
  } catch { /* missing */ }

  // 2. Scan memory directory
  try {
    const entries = await fs.readdir(memDir);
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    for (const entry of entries) {
      const fullPath = path.join(memDir, entry);
      try {
        const stat = await fs.stat(fullPath);
        if (!stat.isFile()) continue;
        result.totalSize.bytes += stat.size;

        if (entry.match(/^\d{4}-\d{2}-\d{2}\.md$/)) {
          result.dailyNotes.push({ name: entry, bytes: stat.size, modified: stat.mtime.toISOString() });
        } else if (entry.startsWith('archive-')) {
          result.archives.push({ name: entry, bytes: stat.size });
        }

        if (now - stat.mtime.getTime() < sevenDays) {
          result.recentNotes.push(entry);
        } else if (entry.match(/^\d{4}-\d{2}-\d{2}\.md$/)) {
          result.staleCount++;
        }
      } catch { /* skip */ }
    }
  } catch { /* missing dir */ }

  // Sort daily notes newest first
  result.dailyNotes.sort((a, b) => b.name.localeCompare(a.name));
  result.recentNotes.sort((a, b) => b.localeCompare(a));

  // Human-readable size
  const bytes = result.totalSize.bytes;
  if (bytes > 1048576) result.totalSize.human = (bytes / 1048576).toFixed(1) + 'MB';
  else if (bytes > 1024) result.totalSize.human = (bytes / 1024).toFixed(1) + 'KB';
  else result.totalSize.human = bytes + 'B';

  result.summary = `MEMORY.md: ${result.memoryMd.lines} lines | ${result.dailyNotes.length} daily notes | ${result.archives.length} archives | ${result.totalSize.human} total | ${result.staleCount} stale`;

  return result;
}

/**
 * Evolution Stats - Quick evolution system health check in a single call.
 * Replaces: cat events.jsonl | wc -l + ls genes/ + ls capsules/ + tail events
 * @returns {Promise<Object>} - { eventCount, geneCount, capsuleCount, lastEvent, successRate, streakInfo }
 */
async function evolutionStats() {
  const assetsDir = '/root/openclaw/skills/evolver/assets/gep';
  const result = {
    eventCount: 0,
    geneCount: 0,
    capsuleCount: 0,
    lastEvent: null,
    recentEvents: [],
    successRate: 0,
    consecutiveSuccesses: 0,
    summary: ''
  };

  // 1. Events
  try {
    const eventsContent = await fs.readFile(path.join(assetsDir, 'events.jsonl'), 'utf8');
    const lines = eventsContent.trim().split('\n').filter(Boolean);
    const events = [];
    let successes = 0;
    let totalWithOutcome = 0;

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'EvolutionEvent' || obj.intent) {
          events.push(obj);
          if (obj.outcome) {
            totalWithOutcome++;
            if (obj.outcome.status === 'success') successes++;
          }
        }
      } catch { /* skip */ }
    }

    result.eventCount = events.length;
    result.successRate = totalWithOutcome > 0 ? Math.round(successes / totalWithOutcome * 100) : 0;

    // Last 3 events summary
    result.recentEvents = events.slice(-3).map(e => ({
      id: e.id, intent: e.intent, signals: e.signals, status: e.outcome?.status
    }));

    // Consecutive success streak from tail
    result.consecutiveSuccesses = 0;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].outcome?.status === 'success') result.consecutiveSuccesses++;
      else break;
    }

    if (events.length > 0) {
      const last = events[events.length - 1];
      result.lastEvent = { id: last.id, intent: last.intent, status: last.outcome?.status };
    }
  } catch { /* no events file */ }

  // 2. Gene count
  try {
    const genesDir = path.join(assetsDir, 'genes');
    const genes = await fs.readdir(genesDir);
    result.geneCount = genes.filter(f => f.endsWith('.json')).length;
  } catch { /* */ }

  // 3. Capsule count
  try {
    const capsulesDir = path.join(assetsDir, 'capsules');
    const capsules = await fs.readdir(capsulesDir);
    result.capsuleCount = capsules.filter(f => f.endsWith('.json')).length;
  } catch { /* */ }

  result.summary = `${result.eventCount} events (${result.successRate}% success) | ${result.geneCount} genes | ${result.capsuleCount} capsules | streak: ${result.consecutiveSuccesses}`;

  return result;
}

/**
 * Batch File Check - Check existence of multiple files in one call.
 * Replaces repeated fileExists calls.
 * @param {Array<string>} paths - File paths to check
 * @returns {Promise<Object>} - { results: {path: boolean}, allExist: boolean, missing: string[] }
 */
async function batchFileCheck(paths) {
  const results = {};
  const missing = [];

  for (const p of paths) {
    const exists = await fileExists(p);
    results[p] = exists;
    if (!exists) missing.push(p);
  }

  return {
    results,
    allExist: missing.length === 0,
    missing
  };
}

/**
 * Main entry point (for testing and CLI usage)
 * Usage:
 *   node index.js preflight    - Run evolver preflight checks
 *   node index.js health       - System health check
 *   node index.js skill <name> - Check skill health
 */
async function main() {
  const cmd = process.argv[2];

  if (cmd === 'preflight') {
    const report = await evolverPreflight();
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (cmd === 'health') {
    const health = await systemHealth();
    console.log(JSON.stringify(health, null, 2));
    return;
  }

  if (cmd === 'skill' && process.argv[3]) {
    const report = await skillHealth(process.argv[3]);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (cmd === 'memory') {
    const stats = await memoryStats();
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  if (cmd === 'evo') {
    const stats = await evolutionStats();
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  // Default: list capabilities
  console.log('exec-optimizer loaded successfully');
  console.log('Available functions:', Object.keys(module.exports).filter(k => k !== 'main'));
  console.log('\nCLI commands:');
  console.log('  node index.js preflight  - Evolver pre-flight (replaces 5-7 exec calls)');
  console.log('  node index.js health     - System health summary');
  console.log('  node index.js skill <n>  - Check skill integrity');
  console.log('  node index.js memory     - Memory/notes statistics');
  console.log('  node index.js evo        - Evolution system stats');
}

module.exports = {
  gitStatus,
  gitLog,
  gitDiff,
  fileExists,
  dirSize,
  findFiles,
  readLines,
  processInfo,
  batchExec,
  systemHealth,
  skillHealth,
  evolverPreflight,
  batchFileCheck,
  memoryStats,
  evolutionStats,
  main
};

// CLI entry point
if (require.main === module) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
