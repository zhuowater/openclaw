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
 * Quick Diagnostic - All-in-one session diagnostic that replaces 3-5 separate exec calls.
 * Replaces: git status + ls memory/ + df -h + node -v + uptime
 * Designed to be the first call in any session to establish context fast.
 * @param {Object} options - { includeGit: true, includeMemory: true, includeEvo: false }
 * @returns {Promise<Object>} - Consolidated diagnostic report
 */
async function quickDiag(options = {}) {
  const { includeGit = true, includeMemory = true, includeEvo = false } = options;
  const report = {};

  // 1. System basics (always)
  report.system = await systemHealth();

  // 2. Today's date + memory file existence
  const today = new Date().toISOString().slice(0, 10);
  const todayFile = `/root/openclaw/memory/${today}.md`;
  report.today = today;
  report.todayNoteExists = await fileExists(todayFile);

  // 3. Git status (optional, default on)
  if (includeGit) {
    try {
      report.git = await gitStatus();
      if (!report.git.clean) {
        report.gitDirtyCount = report.git.modified.length + report.git.untracked.length + report.git.staged.length;
      }
    } catch (e) {
      report.git = { error: e.message };
    }
  }

  // 4. Memory overview (optional, default on)
  if (includeMemory) {
    try {
      const memDir = '/root/openclaw/memory';
      const files = await fs.readdir(memDir);
      const mdFiles = files.filter(f => f.endsWith('.md'));
      const recentFiles = mdFiles
        .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
        .sort()
        .slice(-3);
      report.memory = {
        totalNotes: mdFiles.length,
        recentDays: recentFiles.map(f => f.replace('.md', '')),
      };
    } catch (e) {
      report.memory = { error: e.message };
    }
  }

  // 5. Evolution stats (optional)
  if (includeEvo) {
    try {
      const eventsPath = '/root/openclaw/skills/evolver/assets/gep/events.jsonl';
      const content = await fs.readFile(eventsPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const successCount = events.filter(e => e.outcome && e.outcome.status === 'success').length;
      report.evolution = {
        totalEvents: events.length,
        successCount,
        successRate: events.length > 0 ? Math.round(successCount / events.length * 100) + '%' : 'N/A',
        latestId: events.length > 0 ? events[events.length - 1].id : null,
      };
    } catch (e) {
      report.evolution = { error: e.message };
    }
  }

  // Summary line
  const parts = [];
  parts.push(`Uptime: ${report.system.uptime}`);
  parts.push(`Disk: ${report.system.disk}`);
  if (report.git && !report.git.error) {
    parts.push(report.git.clean ? 'Git: clean' : `Git: ${report.gitDirtyCount} dirty`);
  }
  parts.push(`Today note: ${report.todayNoteExists ? 'exists' : 'missing'}`);
  report.summary = parts.join(' | ');

  return report;
}

/**
 * Log Tail - Read last N lines from a file without spawning shell.
 * Replaces: tail -n 20 /path/to/file (common in heartbeat/cron sessions)
 * @param {string} filePath - File to read
 * @param {number} lines - Number of lines from end (default: 20)
 * @returns {Promise<Object>} - { lines: string[], totalLines: number, file: string }
 */
async function logTail(filePath, lines = 20) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const allLines = content.split('\n');
    const totalLines = allLines.length;
    const tail = allLines.slice(-lines).filter(l => l.length > 0);
    return { lines: tail, totalLines, file: path.basename(filePath) };
  } catch (err) {
    throw new Error(`logTail failed: ${err.message}`);
  }
}

/**
 * Cron Stats - Read heartbeat-state.json and summarize cron/heartbeat timing.
 * Replaces: cat heartbeat-state.json + date calculations (common in heartbeat sessions)
 * @param {string} workspace - Root workspace path (default: /root/openclaw)
 * @returns {Promise<Object>} - { state, staleChecks, summary }
 */
async function cronStats(workspace = '/root/openclaw') {
  const statePath = path.join(workspace, 'memory/heartbeat-state.json');
  try {
    const content = await fs.readFile(statePath, 'utf8');
    const state = JSON.parse(content);
    const now = new Date();
    const staleChecks = [];

    for (const [key, val] of Object.entries(state)) {
      if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
        const ts = new Date(val);
        const hoursAgo = (now - ts) / (1000 * 60 * 60);
        if (hoursAgo > 24) {
          staleChecks.push({ key, lastRun: val, hoursAgo: Math.round(hoursAgo) });
        }
      }
    }

    return {
      state,
      staleChecks,
      summary: staleChecks.length > 0
        ? `⚠️ ${staleChecks.length} stale checks: ${staleChecks.map(c => c.key).join(', ')}`
        : '✅ All heartbeat checks within 24h'
    };
  } catch (err) {
    return { state: null, staleChecks: [], summary: `❌ Cannot read heartbeat state: ${err.message}` };
  }
}

/**
 * JSON Read - Read and parse a JSON file without spawning shell.
 * Replaces: cat file.json | python3 -c "import json..." or exec + jq patterns
 * @param {string} filePath - JSON file path
 * @param {string} [jsonPath] - Optional dot-path to extract (e.g., "outcome.status")
 * @returns {Promise<any>} - Parsed JSON or extracted value
 */
async function jsonRead(filePath, jsonPath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(content);
    if (!jsonPath) return data;

    // Navigate dot-path
    const parts = jsonPath.split('.');
    let current = data;
    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }
    return current;
  } catch (err) {
    throw new Error(`jsonRead(${filePath}): ${err.message}`);
  }
}

/**
 * Grep Files - Search file contents without spawning shell grep.
 * Replaces: grep -r "pattern" dir, grep -l "pattern" files
 * @param {string} dir - Directory to search
 * @param {string|RegExp} pattern - Search pattern (string or regex)
 * @param {object} [options] - { maxDepth: 3, extensions: ['.js','.md'], maxResults: 50, includeLines: true }
 * @returns {Promise<Array<{file:string, line:number, text:string}>>}
 */
async function grepFiles(dir, pattern, options = {}) {
  const { maxDepth = 3, extensions = null, maxResults = 50, includeLines = true } = options;
  const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
  const results = [];

  async function walk(currentDir, depth) {
    if (depth > maxDepth || results.length >= maxResults) return;
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxResults) break;
        const fullPath = path.join(currentDir, entry.name);
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        if (entry.isDirectory()) {
          await walk(fullPath, depth + 1);
        } else if (entry.isFile()) {
          if (extensions && !extensions.some(ext => entry.name.endsWith(ext))) continue;
          try {
            const content = await fs.readFile(fullPath, 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length && results.length < maxResults; i++) {
              if (regex.test(lines[i])) {
                results.push(includeLines
                  ? { file: fullPath, line: i + 1, text: lines[i].trim().slice(0, 200) }
                  : { file: fullPath, line: i + 1 });
              }
            }
          } catch (_) { /* skip binary/unreadable */ }
        }
      }
    } catch (_) { /* skip inaccessible dirs */ }
  }

  await walk(dir, 0);
  return results;
}

/**
 * Latest File - Find most recently modified file in a directory.
 * Replaces: ls -t dir | head -1, ls -lt dir | head -N
 * @param {string} dir - Directory to scan
 * @param {object} [options] - { pattern: '*.txt', count: 1, recursive: false }
 * @returns {Promise<Array<{name:string, path:string, mtime:string, size:number}>>}
 */
async function latestFile(dir, options = {}) {
  const { pattern = null, count = 1, recursive = false } = options;
  const files = [];

  async function scan(currentDir, depth) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isFile()) {
          if (pattern) {
            const re = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
            if (!re.test(entry.name)) continue;
          }
          try {
            const stat = await fs.stat(fullPath);
            files.push({ name: entry.name, path: fullPath, mtime: stat.mtime.toISOString(), size: stat.size });
          } catch (_) {}
        } else if (entry.isDirectory() && recursive && depth < 3 && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await scan(fullPath, depth + 1);
        }
      }
    } catch (_) {}
  }

  await scan(dir, 0);
  files.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
  return files.slice(0, count);
}

/**
 * Disk Usage - Get disk usage stats without spawning df/du.
 * Replaces: df -h, du -sh dir
 * @param {string} [targetPath='/'] - Path to check
 * @returns {Promise<{total:string, used:string, available:string, usedPercent:string, path:string}>}
 */
async function diskUsage(targetPath = '/') {
  try {
    const stats = await fs.statfs(targetPath);
    const total = stats.bsize * stats.blocks;
    const free = stats.bsize * stats.bfree;
    const used = total - free;
    const usedPct = total > 0 ? ((used / total) * 100).toFixed(1) : '0';
    const fmt = (bytes) => {
      if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + 'G';
      if (bytes > 1e6) return (bytes / 1e6).toFixed(1) + 'M';
      return (bytes / 1e3).toFixed(1) + 'K';
    };
    return { total: fmt(total), used: fmt(used), available: fmt(free), usedPercent: usedPct + '%', path: targetPath };
  } catch (err) {
    throw new Error(`diskUsage(${targetPath}): ${err.message}`);
  }
}

/**
 * Disk Cleanup - Safe, automated cleanup of known-safe temp/cache files.
 * Addresses: protocol_drift (disk bloat = system degradation), repeated_tool_usage:exec
 * Replaces: manual du/find/rm exec calls for disk maintenance.
 * @param {Object} [options] - { dryRun: boolean }
 * @returns {Promise<Object>} - { before, after, freed, actions[] }
 */
async function diskCleanup(options = {}) {
  const { dryRun = false } = options;
  const actions = [];
  let totalFreed = 0;

  const fmt = (bytes) => {
    if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + 'G';
    if (bytes > 1e6) return (bytes / 1e6).toFixed(1) + 'M';
    return (bytes / 1e3).toFixed(1) + 'K';
  };

  // Helper: get dir size recursively
  async function getDirSize(dir) {
    let total = 0;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          total += await getDirSize(full);
        } else {
          try { total += (await fs.stat(full)).size; } catch {} 
        }
      }
    } catch {}
    return total;
  }

  // Helper: remove directory recursively
  async function rmDir(dir) {
    try { await fs.rm(dir, { recursive: true, force: true }); } catch {}
  }

  // Helper: remove file
  async function rmFile(file) {
    try { await fs.unlink(file); } catch {}
  }

  // Get disk before
  let before;
  try { before = await diskUsage('/'); } catch { before = { usedPercent: 'unknown' }; }

  // 1. Clean /tmp/pip-unpack-* dirs (stale pip temp files)
  try {
    const tmpEntries = await fs.readdir('/tmp', { withFileTypes: true });
    for (const e of tmpEntries) {
      if (e.isDirectory() && e.name.startsWith('pip-unpack-')) {
        const full = path.join('/tmp', e.name);
        const size = await getDirSize(full);
        if (!dryRun) await rmDir(full);
        totalFreed += size;
        actions.push({ target: full, size: fmt(size), action: dryRun ? 'would_remove' : 'removed' });
      }
    }
  } catch {}

  // 2. Clean old generated images (>7 days) in skills/image-generate/
  try {
    const imgDir = '/root/openclaw/skills/image-generate';
    const imgEntries = await fs.readdir(imgDir);
    const now = Date.now();
    for (const name of imgEntries) {
      if (!name.startsWith('generated_image_') || !name.endsWith('.png')) continue;
      const full = path.join(imgDir, name);
      const stat = await fs.stat(full);
      const ageDays = (now - stat.mtimeMs) / (1000 * 60 * 60 * 24);
      if (ageDays > 7) {
        if (!dryRun) await rmFile(full);
        totalFreed += stat.size;
        actions.push({ target: full, size: fmt(stat.size), ageDays: Math.round(ageDays), action: dryRun ? 'would_remove' : 'removed' });
      }
    }
  } catch {}

  // 3. Clean npm cache
  try {
    const npmCache = '/root/.npm/_cacache';
    const stat = await fs.stat(npmCache);
    if (stat.isDirectory()) {
      const size = await getDirSize(npmCache);
      if (size > 50 * 1e6) { // Only clean if > 50MB
        if (!dryRun) {
          try { await execFileAsync('npm', ['cache', 'clean', '--force'], { timeout: 30000 }); } catch {}
        }
        totalFreed += size;
        actions.push({ target: 'npm cache', size: fmt(size), action: dryRun ? 'would_clean' : 'cleaned' });
      }
    }
  } catch {}

  // 4. Clean old /var/log files (>14 days, only .gz and rotated logs)
  try {
    const logDir = '/var/log';
    const logEntries = await fs.readdir(logDir);
    const now = Date.now();
    for (const name of logEntries) {
      if (!name.endsWith('.gz') && !name.match(/\.\d+$/)) continue;
      const full = path.join(logDir, name);
      try {
        const stat = await fs.stat(full);
        if (!stat.isFile()) continue;
        const ageDays = (now - stat.mtimeMs) / (1000 * 60 * 60 * 24);
        if (ageDays > 14) {
          if (!dryRun) await rmFile(full);
          totalFreed += stat.size;
          actions.push({ target: full, size: fmt(stat.size), action: dryRun ? 'would_remove' : 'removed' });
        }
      } catch {}
    }
  } catch {}

  // 5. Clean stale whisper-venv in /tmp (>3 days old)
  try {
    const whisperDir = '/tmp/whisper-venv';
    const stat = await fs.stat(whisperDir);
    const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
    if (ageDays > 3) {
      const size = await getDirSize(whisperDir);
      if (!dryRun) await rmDir(whisperDir);
      totalFreed += size;
      actions.push({ target: whisperDir, size: fmt(size), ageDays: Math.round(ageDays), action: dryRun ? 'would_remove' : 'removed' });
    }
  } catch {}

  // 6. Clean old GEP evolution prompt files (keep latest 5)
  try {
    const evoDir = '/root/openclaw/memory/evolution';
    const evoEntries = await fs.readdir(evoDir);
    const promptFiles = evoEntries
      .filter(f => f.startsWith('gep_prompt_') && f.endsWith('.txt'))
      .sort()
      .reverse(); // newest first (alphabetical sort on cycle number works)
    
    // Keep the 5 most recent, remove older ones
    const toRemove = promptFiles.slice(5);
    for (const name of toRemove) {
      const full = path.join(evoDir, name);
      try {
        const stat = await fs.stat(full);
        if (!dryRun) await rmFile(full);
        totalFreed += stat.size;
        actions.push({ target: full, size: fmt(stat.size), action: dryRun ? 'would_remove' : 'removed' });
      } catch {}
    }
  } catch {}

  // Get disk after
  let after;
  try { after = await diskUsage('/'); } catch { after = { usedPercent: 'unknown' }; }

  return {
    dryRun,
    before: before.usedPercent,
    after: after.usedPercent,
    freed: fmt(totalFreed),
    freedBytes: totalFreed,
    actionCount: actions.length,
    actions,
    summary: dryRun
      ? `Dry run: would free ${fmt(totalFreed)} across ${actions.length} targets`
      : `Freed ${fmt(totalFreed)} across ${actions.length} targets (${before.usedPercent} → ${after.usedPercent})`
  };
}

/**
 * Git Commit - Stage files and commit in a single call.
 * Replaces: git add <files> + git commit -m "msg" (2 exec calls → 1 function call)
 * @param {string} message - Commit message
 * @param {Object} [options] - { files: string[]|'all', cwd: string }
 * @returns {Promise<{ok:boolean, hash:string, message:string, filesChanged:number}>}
 */
async function gitCommit(message, options = {}) {
  const { files = 'all', cwd = '/root/openclaw' } = options;

  try {
    // Stage
    if (files === 'all') {
      await execFileAsync('git', ['add', '-A'], { cwd });
    } else if (Array.isArray(files) && files.length > 0) {
      await execFileAsync('git', ['add', '--', ...files], { cwd });
    } else {
      throw new Error('files must be "all" or a non-empty array of paths');
    }

    // Commit
    const { stdout } = await execFileAsync('git', ['commit', '-m', message], { cwd });

    // Parse output for hash and file count
    const hashMatch = stdout.match(/\[[\w/-]+ ([a-f0-9]+)\]/);
    const filesMatch = stdout.match(/(\d+) files? changed/);
    return {
      ok: true,
      hash: hashMatch ? hashMatch[1] : 'unknown',
      message,
      filesChanged: filesMatch ? parseInt(filesMatch[1]) : 0
    };
  } catch (err) {
    // "nothing to commit" is not a real error
    if (err.stderr && err.stderr.includes('nothing to commit')) {
      return { ok: true, hash: null, message, filesChanged: 0 };
    }
    throw new Error(`gitCommit failed: ${(err.stderr || err.message).trim().slice(0, 200)}`);
  }
}

/**
 * File Stats - Batch stat multiple files in one call (size, mtime, type).
 * Replaces: repeated ls -la / stat calls on individual files.
 * @param {string[]} paths - Array of file paths
 * @returns {Promise<Array<{path:string, exists:boolean, size?:number, mtime?:string, isDir?:boolean}>>}
 */
async function fileStatsBatch(paths) {
  const results = [];
  for (const p of paths) {
    try {
      const stat = await fs.stat(p);
      results.push({
        path: p,
        exists: true,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        isDir: stat.isDirectory()
      });
    } catch {
      results.push({ path: p, exists: false });
    }
  }
  return results;
}

/**
 * HTTP Fetch - Make HTTP requests without spawning curl.
 * Replaces: exec curl -s URL, curl -X POST -H "..." -d "..." URL
 * Uses Node.js built-in http/https modules with retry and timeout.
 * @param {string} url - URL to fetch
 * @param {Object} [options] - { method, headers, body, timeout, retries, retryDelayMs }
 * @returns {Promise<{ok:boolean, status:number, headers:Object, body:string, elapsed:number}>}
 */
async function httpFetch(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body = null,
    timeout = 15000,
    retries = 2,
    retryDelayMs = 1000
  } = options;
  const mod = url.startsWith('https') ? require('https') : require('http');

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  for (let attempt = 0; attempt <= retries; attempt++) {
    const start = Date.now();
    try {
      const result = await new Promise((resolve, reject) => {
        const reqOpts = {
          method,
          headers: { ...headers },
          timeout
        };
        if (body && !reqOpts.headers['Content-Type']) {
          reqOpts.headers['Content-Type'] = 'application/json';
        }

        const req = mod.request(url, reqOpts, (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const respBody = Buffer.concat(chunks).toString('utf8');
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              headers: res.headers,
              body: respBody,
              elapsed: Date.now() - start
            });
          });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

        if (body) {
          req.write(typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.end();
      });

      // Don't retry on 4xx client errors
      if (result.ok || (result.status >= 400 && result.status < 500)) {
        return result;
      }
      // Retry on 5xx
      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      return result;
    } catch (err) {
      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      return {
        ok: false,
        status: 0,
        headers: {},
        body: '',
        error: err.message,
        elapsed: Date.now() - start
      };
    }
  }
}

/**
 * Env Exec - Run a command with environment variables set, without shell string escaping.
 * Replaces: exec('KEY=val KEY2=val2 command args') which requires careful escaping.
 * @param {string} cmd - Command to run (string, will be shell-interpreted)
 * @param {Object} [env] - Extra environment variables to merge
 * @param {Object} [options] - { cwd, timeout }
 * @returns {Promise<{ok:boolean, stdout:string, stderr:string, exitCode:number}>}
 */
async function envExec(cmd, env = {}, options = {}) {
  const { cwd = '/root/openclaw', timeout = 30000 } = options;
  try {
    const { stdout, stderr } = await execFileAsync('sh', ['-c', cmd], {
      cwd,
      timeout,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, ...env }
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (err) {
    return {
      ok: false,
      stdout: (err.stdout || '').trim(),
      stderr: (err.stderr || err.message || '').trim(),
      exitCode: err.code || 1
    };
  }
}

/**
 * Session Exec Analysis - Analyze exec usage patterns from session logs.
 * Helps identify which exec calls could be replaced by exec-optimizer functions.
 * @param {string} [sessionsDir] - Path to sessions directory
 * @param {number} [count] - Number of recent sessions to analyze (default: 5)
 * @returns {Promise<Object>} - { totalExecCalls, commandPatterns, optimizableCount, suggestions }
 */
async function sessionExecAnalysis(sessionsDir, count = 5) {
  const dir = sessionsDir || '/root/.openclaw/agents/main/sessions';
  const result = {
    sessionsAnalyzed: 0,
    totalExecCalls: 0,
    commandPatterns: {},
    optimizable: [],
    suggestions: []
  };

  const optimizablePatterns = {
    'curl': 'Use httpFetch() instead of exec curl',
    'git status': 'Use gitStatus() instead of exec git status',
    'git log': 'Use gitLog() instead of exec git log',
    'git diff': 'Use gitDiff() instead of exec git diff',
    'git add': 'Use gitCommit() for add+commit in one call',
    'ls -t': 'Use latestFile() instead of exec ls -t',
    'ls -l': 'Use fileStatsBatch() instead of exec ls -l',
    'tail ': 'Use logTail() instead of exec tail',
    'cat ': 'Use readLines() or read tool instead of exec cat',
    'grep ': 'Use grepFiles() instead of exec grep',
    'find ': 'Use findFiles() instead of exec find',
    'df ': 'Use diskUsage() instead of exec df',
    'du ': 'Use dirSize() instead of exec du',
    'wc -l': 'Use readLines() and count instead of exec wc -l',
    'stat ': 'Use fileStatsBatch() instead of exec stat'
  };

  try {
    const files = await fs.readdir(dir);
    const jsonlFiles = files
      .filter(f => f.endsWith('.jsonl') && !f.includes('.deleted.') && !f.includes('.reset.'));

    // Sort by modification time (newest first) since UUID filenames don't sort chronologically
    const withMtime = [];
    for (const file of jsonlFiles) {
      try {
        const stat = await fs.stat(path.join(dir, file));
        withMtime.push({ file, mtime: stat.mtimeMs });
      } catch { /* skip */ }
    }
    withMtime.sort((a, b) => b.mtime - a.mtime);
    const targetFiles = withMtime.slice(0, count).map(w => w.file);

    for (const file of targetFiles) {
      const content = await fs.readFile(path.join(dir, file), 'utf8');
      const lines = content.split('\n').filter(Boolean);
      let sessionExecs = 0;

      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          // Look for tool_use with name=exec in message.content array
          const contentArr = obj?.message?.content || obj?.content;
          if (contentArr && Array.isArray(contentArr)) {
            for (const block of contentArr) {
              if ((block.type === 'tool_use' || block.type === 'toolCall') && block.name === 'exec') {
                // Handle both 'input' and 'arguments' field names (dict or JSON string)
                let args = block.input || block.arguments || {};
                if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
                const cmd = args.command;
                if (!cmd) continue;
                sessionExecs++;
                // Categorize by first significant command word
                const cleaned = cmd.replace(/^cd\s+[^\s]+\s*&&\s*/, '').replace(/^\w+=\S+\s+/, '');
                const firstWord = cleaned.split(/[\s|;]/)[0];
                result.commandPatterns[firstWord] = (result.commandPatterns[firstWord] || 0) + 1;

                // Check if optimizable
                for (const [pattern, suggestion] of Object.entries(optimizablePatterns)) {
                  if (cmd.includes(pattern)) {
                    result.optimizable.push({ cmd: cmd.slice(0, 120), suggestion });
                    break;
                  }
                }
              }
            }
          }
        } catch { /* skip unparseable */ }
      }

      result.totalExecCalls += sessionExecs;
      result.sessionsAnalyzed++;
    }

    // Generate top suggestions
    const patternCounts = {};
    for (const item of result.optimizable) {
      patternCounts[item.suggestion] = (patternCounts[item.suggestion] || 0) + 1;
    }
    result.suggestions = Object.entries(patternCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([suggestion, count]) => `${suggestion} (${count} occurrences)`);

    result.optimizableCount = result.optimizable.length;
    // Trim optimizable to top 10 examples
    result.optimizable = result.optimizable.slice(0, 10);

  } catch (err) {
    result.error = err.message;
  }

  return result;
}

/**
 * Main entry point (for testing and CLI usage)
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

  if (cmd === 'diag') {
    const includeEvo = process.argv.includes('--evo');
    const report = await quickDiag({ includeEvo });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (cmd === 'tail' && process.argv[3]) {
    const lines = parseInt(process.argv[4]) || 20;
    const report = await logTail(process.argv[3], lines);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (cmd === 'cron') {
    const report = await cronStats();
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (cmd === 'json' && process.argv[3]) {
    const result = await jsonRead(process.argv[3], process.argv[4]);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'grep' && process.argv[3] && process.argv[4]) {
    const exts = process.argv[5] ? process.argv[5].split(',').map(e => e.startsWith('.') ? e : '.' + e) : null;
    const results = await grepFiles(process.argv[3], process.argv[4], { extensions: exts });
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (cmd === 'latest' && process.argv[3]) {
    const results = await latestFile(process.argv[3], { pattern: process.argv[4] || null, count: parseInt(process.argv[5]) || 5 });
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (cmd === 'disk') {
    const result = await diskUsage(process.argv[3] || '/');
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'commit' && process.argv[3]) {
    const result = await gitCommit(process.argv[3]);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'fstats') {
    const paths = process.argv.slice(3);
    if (paths.length === 0) { console.error('Usage: fstats <path1> [path2] ...'); process.exit(1); }
    const result = await fileStatsBatch(paths);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'cleanup') {
    const dryRun = process.argv.includes('--dry-run');
    const result = await diskCleanup({ dryRun });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'gep-maintain' || cmd === 'gep-maint') {
    const dryRun = process.argv.includes('--dry-run');
    const result = await gepMaintain({ dryRun });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'fetch' && process.argv[3]) {
    const result = await httpFetch(process.argv[3]);
    console.log(JSON.stringify({ ok: result.ok, status: result.status, elapsed: result.elapsed, bodyLength: result.body.length }, null, 2));
    return;
  }

  if (cmd === 'exec-analysis') {
    const count = parseInt(process.argv[3]) || 5;
    const result = await sessionExecAnalysis(null, count);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'signal-trend' || cmd === 'signals') {
    const count = parseInt(process.argv[3]) || 10;
    const result = await signalTrend(count);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'skill-audit' || cmd === 'audit') {
    const deep = process.argv.includes('--deep');
    const result = await skillAudit({ includeImportCheck: deep });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'heartbeat-check' || cmd === 'hb') {
    const result = await heartbeatCheck();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'batch') {
    // Run multiple named sub-commands in one call
    // Usage: node index.js batch health,evo,memory
    const subcmds = (process.argv[3] || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!subcmds.length) {
      console.log('Usage: node index.js batch health,evo,memory,diag,preflight,cron,disk,git');
      return;
    }
    const results = {};
    for (const sub of subcmds) {
      try {
        if (sub === 'health') results.health = await systemHealth();
        else if (sub === 'evo') results.evo = await evolutionStats();
        else if (sub === 'memory') results.memory = await memoryStats();
        else if (sub === 'diag') results.diag = await quickDiag({ evo: false });
        else if (sub === 'preflight') results.preflight = await evolverPreflight();
        else if (sub === 'cron') results.cron = await cronStats();
        else if (sub === 'disk') results.disk = await diskUsage();
        else if (sub === 'git') results.git = await gitStatus();
        else if (sub === 'hb' || sub === 'heartbeat') results.heartbeat = await heartbeatCheck();
        else results[sub] = { error: `Unknown sub-command: ${sub}` };
      } catch (e) {
        results[sub] = { error: e.message };
      }
    }
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (cmd === 'suggest') {
    // Analyze a command string and suggest exec-optimizer alternative
    const target = process.argv.slice(3).join(' ');
    if (!target) {
      console.log('Usage: node index.js suggest "git status && df -h"');
      return;
    }
    const suggestions = [];
    if (/\bgit\s+status\b/.test(target)) suggestions.push('Use: node index.js diag (includes git status)');
    if (/\bgit\s+diff\b/.test(target)) suggestions.push('Use: gitDiff() API or read tool for file diffs');
    if (/\bgit\s+log\b/.test(target)) suggestions.push('Use: gitLog() API — node -e "require(\'./skills/exec-optimizer\').gitLog(5).then(r=>console.log(JSON.stringify(r)))"');
    if (/\bgit\s+add\b.*\bgit\s+commit\b/.test(target)) suggestions.push('Use: node index.js commit "message"');
    if (/\bdf\b/.test(target)) suggestions.push('Use: node index.js disk');
    if (/\bfree\b/.test(target)) suggestions.push('Use: node index.js health');
    if (/\bgrep\s+-r\b/.test(target)) suggestions.push('Use: node index.js grep <dir> <pattern>');
    if (/\bgrep\b/.test(target) && !/\bgrep\s+-r\b/.test(target)) suggestions.push('Use: node index.js grep <dir> <pattern> or read tool with search');
    if (/\bls\s+-t\b/.test(target)) suggestions.push('Use: node index.js latest <dir> [pattern] [count]');
    if (/\bls\s+-la?\b/.test(target)) suggestions.push('Use: node index.js fstats <paths...> for file stats');
    if (/\bls\b/.test(target) && !/\bls\s+-[tla]/.test(target)) suggestions.push('Use: read tool on directory or node index.js fstats');
    if (/\btail\b/.test(target)) suggestions.push('Use: node index.js tail <file> [lines]');
    if (/\bcat\b.*\.json\b/.test(target)) suggestions.push('Use: node index.js json <file> [dot.path]');
    if (/\bcat\b/.test(target) && !/\.json\b/.test(target)) suggestions.push('Use: read tool instead of exec cat');
    if (/\bcurl\b/.test(target)) suggestions.push('Use: node index.js fetch <url> or web_fetch tool');
    if (/\bwc\s+-l\b/.test(target)) suggestions.push('Use read tool with line counting or node index.js grep');
    if (/\bdu\b/.test(target)) suggestions.push('Use: node index.js disk [path]');
    if (/\buptime\b/.test(target)) suggestions.push('Use: node index.js health (includes uptime)');
    if (/\bstat\b/.test(target)) suggestions.push('Use: node index.js fstats <paths...>');
    if (/\bfind\b/.test(target)) suggestions.push('Use: findFiles() API or node index.js grep for content search');
    if (/\bhead\b/.test(target) && !/\bls.*head\b/.test(target)) suggestions.push('Use: read tool with limit parameter');
    if (/\bsed\s+-n\b/.test(target)) suggestions.push('Use: read tool with offset/limit for line ranges');
    if (suggestions.length === 0) suggestions.push('No exec-optimizer substitution found for this command. Use exec.');
    console.log(JSON.stringify({ command: target, suggestions }, null, 2));
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
  console.log('  node index.js diag       - Quick session diagnostic (replaces 3-5 exec calls)');
  console.log('  node index.js tail <f> [n] - Tail N lines from file (replaces tail -n)');
  console.log('  node index.js cron       - Heartbeat/cron state check');
  console.log('  node index.js json <f> [path] - Read JSON file with optional dot-path');
  console.log('  node index.js grep <dir> <pattern> [exts] - Search file contents');
  console.log('  node index.js latest <dir> [pattern] [n] - Find latest files');
  console.log('  node index.js disk [path] - Disk usage stats');
  console.log('  node index.js commit <msg> - Git add all + commit (replaces 2 exec calls)');
  console.log('  node index.js fstats <paths...> - Batch file stats (replaces multiple stat/ls)');
  console.log('  node index.js cleanup    - Safe disk cleanup (--dry-run to preview)');
  console.log('  node index.js gep-maintain - GEP asset maintenance (dedup + archive, --dry-run to preview)');
  console.log('  node index.js fetch <url> - HTTP fetch without curl (replaces exec curl)');
  console.log('  node index.js exec-analysis [n] - Analyze exec patterns in recent sessions');
  console.log('  node index.js signal-trend [n] - GEP signal trend analysis (replaces 3-4 exec grep calls)');
  console.log('  node index.js skill-audit [--deep] - Batch audit all skills (replaces manual dir scanning)');
  console.log('  node index.js heartbeat-check - Unified heartbeat check (replaces 3-5 calls, outputs HEARTBEAT_OK or issues)');
}

/**
 * Skill Audit - Batch scan all skills and classify them.
 * Replaces repeated `exec` calls to manually check skill directories.
 * @param {Object} opts - Options
 * @param {boolean} opts.includeImportCheck - Test require() for each skill (slower, default false)
 * @param {string} opts.skillsDir - Skills directory (default: /root/openclaw/skills)
 * @returns {Promise<Object>} - { healthy, degraded, orphan, broken, summary }
 */
async function skillAudit(opts = {}) {
  const skillsDir = opts.skillsDir || '/root/openclaw/skills';
  const includeImportCheck = opts.includeImportCheck || false;

  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));

  const healthy = [];
  const degraded = [];
  const orphan = [];
  const broken = [];

  for (const dir of dirs) {
    const name = dir.name;
    const base = path.join(skillsDir, name);
    const checks = {
      hasIndex: false,
      hasSkillMd: false,
      hasPkg: false,
      importable: null,
      issues: []
    };

    try { await fs.access(path.join(base, 'index.js')); checks.hasIndex = true; } catch {}
    try { await fs.access(path.join(base, 'SKILL.md')); checks.hasSkillMd = true; } catch {}
    try { await fs.access(path.join(base, 'package.json')); checks.hasPkg = true; } catch {}

    // Orphan: no standard files at all
    if (!checks.hasIndex && !checks.hasSkillMd && !checks.hasPkg) {
      // Check if there's at least some content
      const contents = await fs.readdir(base);
      const hasContent = contents.filter(f => !f.startsWith('.')).length > 0;
      orphan.push({ name, hasContent, issues: ['no index.js, SKILL.md, or package.json'] });
      continue;
    }

    // Optional import check
    if (includeImportCheck && checks.hasIndex) {
      try {
        const { stdout } = await execFileAsync('node', [
          '-e', `try { require('${base}'); console.log('ok') } catch(e) { console.error(e.message); process.exit(1) }`
        ], { timeout: 5000 });
        checks.importable = stdout.trim() === 'ok';
        if (!checks.importable) checks.issues.push('import returned non-ok');
      } catch (err) {
        checks.importable = false;
        checks.issues.push(`import error: ${(err.stderr || err.message).trim().slice(0, 100)}`);
      }
    }

    // Classify
    if (checks.importable === false) {
      broken.push({ name, ...checks });
    } else if (!checks.hasSkillMd || !checks.hasIndex) {
      degraded.push({ name, ...checks });
    } else {
      healthy.push({ name, ...checks });
    }
  }

  return {
    healthy: healthy.map(s => s.name),
    degraded: degraded.map(s => ({ name: s.name, issues: s.issues, hasIndex: s.hasIndex, hasSkillMd: s.hasSkillMd })),
    orphan: orphan.map(s => ({ name: s.name, hasContent: s.hasContent })),
    broken: broken.map(s => ({ name: s.name, issues: s.issues })),
    summary: {
      total: dirs.length,
      healthy: healthy.length,
      degraded: degraded.length,
      orphan: orphan.length,
      broken: broken.length
    }
  };
}

/**
 * Signal Trend Analysis - Analyze GEP signal frequency and repetition patterns.
 * Replaces: multiple exec calls to grep/parse events.jsonl for signal analysis.
 * One call replaces 3-4 exec calls (cat events.jsonl | grep | sort | uniq -c).
 * @param {number} [lastN=10] - Number of recent events to analyze
 * @returns {Promise<Object>} - { signals, repeated, stagnation, trend, recommendations }
 */
async function signalTrend(lastN = 10) {
  const evtPath = '/root/openclaw/skills/evolver/assets/gep/events.jsonl';
  const result = {
    analyzed: 0,
    signalFrequency: {},  // signal -> count
    geneFrequency: {},    // gene -> count
    intentBreakdown: {},  // intent -> count
    repeatedSignals: [],  // signals appearing in >50% of cycles
    stagnation: false,    // same signal+gene combo 3+ times
    streak: { type: null, count: 0 },  // success/fail streak
    trend: 'stable',      // improving | stable | degrading | stagnant
    recommendations: [],
    summary: ''
  };

  try {
    const raw = await fs.readFile(evtPath, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const events = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'EvolutionEvent') events.push(obj);
      } catch { /* skip */ }
    }

    const recent = events.slice(-lastN);
    result.analyzed = recent.length;

    // Frequency counts
    for (const evt of recent) {
      // Signals
      if (Array.isArray(evt.signals)) {
        for (const sig of evt.signals) {
          // Normalize long errsig strings
          const key = sig.length > 60 ? sig.substring(0, 60) + '...' : sig;
          result.signalFrequency[key] = (result.signalFrequency[key] || 0) + 1;
        }
      }
      // Genes
      if (Array.isArray(evt.genes_used)) {
        for (const g of evt.genes_used) {
          result.geneFrequency[g] = (result.geneFrequency[g] || 0) + 1;
        }
      }
      // Intent
      if (evt.intent) {
        result.intentBreakdown[evt.intent] = (result.intentBreakdown[evt.intent] || 0) + 1;
      }
    }

    // Repeated signals (>50% of cycles)
    const threshold = Math.max(2, Math.floor(result.analyzed * 0.5));
    result.repeatedSignals = Object.entries(result.signalFrequency)
      .filter(([, c]) => c >= threshold)
      .map(([sig, count]) => ({ signal: sig, count, pct: Math.round(count / result.analyzed * 100) }))
      .sort((a, b) => b.count - a.count);

    // Stagnation detection: same (signal_set + gene) combo 3+ times consecutively
    if (recent.length >= 3) {
      const fingerprints = recent.map(e => {
        const sigs = (e.signals || []).sort().join('|');
        const genes = (e.genes_used || []).sort().join('|');
        return `${sigs}::${genes}`;
      });
      let maxConsec = 1, curConsec = 1;
      for (let i = 1; i < fingerprints.length; i++) {
        if (fingerprints[i] === fingerprints[i - 1]) {
          curConsec++;
          if (curConsec > maxConsec) maxConsec = curConsec;
        } else {
          curConsec = 1;
        }
      }
      result.stagnation = maxConsec >= 3;
    }

    // Success/fail streak from tail
    let streakType = null, streakCount = 0;
    for (let i = recent.length - 1; i >= 0; i--) {
      const s = recent[i].outcome?.status;
      if (!streakType) { streakType = s; streakCount = 1; }
      else if (s === streakType) streakCount++;
      else break;
    }
    result.streak = { type: streakType, count: streakCount };

    // Trend calculation
    if (result.analyzed < 3) {
      result.trend = 'insufficient_data';
    } else {
      const scores = recent.map(e => e.outcome?.score || 0);
      const half = Math.floor(scores.length / 2);
      const firstHalf = scores.slice(0, half).reduce((a, b) => a + b, 0) / half;
      const secondHalf = scores.slice(half).reduce((a, b) => a + b, 0) / (scores.length - half);
      if (result.stagnation) result.trend = 'stagnant';
      else if (secondHalf > firstHalf + 0.05) result.trend = 'improving';
      else if (secondHalf < firstHalf - 0.05) result.trend = 'degrading';
      else result.trend = 'stable';
    }

    // Recommendations
    if (result.stagnation) {
      result.recommendations.push('Stagnation detected: consider switching gene or changing approach');
    }
    if (result.repeatedSignals.some(s => s.signal.includes('repeated_tool_usage'))) {
      result.recommendations.push('Repeated exec usage: use exec-optimizer batch functions instead of individual exec calls');
    }
    if (result.streak.type === 'failed' && result.streak.count >= 2) {
      result.recommendations.push(`Failure streak (${result.streak.count}x): try simpler fix or different gene`);
    }
    const innovateRatio = (result.intentBreakdown.innovate || 0) / result.analyzed;
    if (innovateRatio < 0.3 && result.analyzed >= 5) {
      result.recommendations.push(`Low innovation rate (${Math.round(innovateRatio * 100)}%): consider more innovate cycles`);
    }

    // Summary
    const topSignals = result.repeatedSignals.slice(0, 3).map(s => `${s.signal}(${s.count}x)`).join(', ');
    result.summary = `Analyzed ${result.analyzed} cycles | trend: ${result.trend} | streak: ${result.streak.count}x ${result.streak.type} | top signals: ${topSignals || 'varied'} | ${result.recommendations.length} recommendations`;

  } catch (err) {
    result.summary = `Error: ${err.message}`;
  }

  return result;
}

/**
 * GEP Asset Maintenance - Dedup candidates, archive old events, report stats.
 * Replaces: python3 scripts/gep-maintenance.py + manual wc/ls/grep checks (3-5 exec calls → 1)
 * @param {Object} [options] - { dryRun: boolean, keepEvents: number }
 * @returns {Promise<Object>} - { candidates, events, summary }
 */
async function gepMaintain(options = {}) {
  const { dryRun = false, keepEvents = 30, keepPrompts = 5 } = options;
  const gepDir = path.join('/root/openclaw/skills/evolver/assets/gep');
  const evoDir = path.join('/root/openclaw/memory/evolution');
  const result = { candidates: { before: 0, after: 0, removed: 0 }, events: { before: 0, after: 0, archived: 0 }, prompts: { before: 0, after: 0, removed: 0, freedKB: 0 }, summary: '' };

  // 1. Dedup candidates.jsonl
  const candPath = path.join(gepDir, 'candidates.jsonl');
  try {
    const raw = (await fs.readFile(candPath, 'utf8')).trim();
    const lines = raw ? raw.split('\n').filter(Boolean) : [];
    result.candidates.before = lines.length;
    const seen = {};
    for (const line of lines) {
      try { const obj = JSON.parse(line); seen[obj.id || line] = line; } catch { seen[line] = line; }
    }
    const deduped = Object.values(seen);
    result.candidates.after = deduped.length;
    result.candidates.removed = lines.length - deduped.length;
    if (!dryRun && result.candidates.removed > 0) {
      await fs.writeFile(candPath, deduped.join('\n') + '\n');
    }
  } catch {}

  // 2. Archive old events from events.jsonl
  const evtPath = path.join(gepDir, 'events.jsonl');
  const archPath = path.join(gepDir, 'events_archive.jsonl');
  try {
    const raw = (await fs.readFile(evtPath, 'utf8')).trim();
    const entries = raw ? raw.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
    result.events.before = entries.length;
    const evts = entries.filter(e => e.type === 'EvolutionEvent');
    const vrs = entries.filter(e => e.type === 'ValidationReport');
    const others = entries.filter(e => e.type !== 'EvolutionEvent' && e.type !== 'ValidationReport');

    if (evts.length > keepEvents) {
      evts.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
      vrs.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
      const archivedEvts = evts.slice(0, -keepEvents);
      const archivedVrs = vrs.slice(0, -keepEvents);
      const keptEvts = evts.slice(-keepEvents);
      const keptVrs = vrs.slice(-keepEvents);
      const archived = [...archivedEvts, ...archivedVrs];
      const kept = [...keptEvts, ...keptVrs, ...others];
      kept.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
      result.events.archived = archived.length;
      result.events.after = kept.length;
      if (!dryRun && archived.length > 0) {
        await fs.appendFile(archPath, archived.map(e => JSON.stringify(e)).join('\n') + '\n');
        await fs.writeFile(evtPath, kept.map(e => JSON.stringify(e)).join('\n') + '\n');
      }
    } else {
      result.events.after = entries.length;
    }
  } catch {}

  // 3. Clean up old GEP prompt files (keep only the latest N)
  try {
    const evoFiles = await fs.readdir(evoDir);
    const promptTxts = evoFiles.filter(f => f.startsWith('gep_prompt_') && f.endsWith('.txt')).sort();
    const promptJsons = evoFiles.filter(f => f.startsWith('gep_prompt_') && f.endsWith('.json')).sort();
    const allPrompts = [...promptTxts, ...promptJsons];
    result.prompts.before = allPrompts.length;
    
    const toRemoveTxt = promptTxts.length > keepPrompts ? promptTxts.slice(0, -keepPrompts) : [];
    const toRemoveJson = promptJsons.length > keepPrompts ? promptJsons.slice(0, -keepPrompts) : [];
    const toRemove = [...toRemoveTxt, ...toRemoveJson];
    result.prompts.removed = toRemove.length;
    result.prompts.after = allPrompts.length - toRemove.length;
    
    let freedBytes = 0;
    for (const f of toRemove) {
      const fp = path.join(evoDir, f);
      try {
        const st = await fs.stat(fp);
        freedBytes += st.size;
        if (!dryRun) await fs.unlink(fp);
      } catch {}
    }
    result.prompts.freedKB = Math.round(freedBytes / 1024);
  } catch {}

  const actions = [];
  if (result.candidates.removed > 0) actions.push(`deduped ${result.candidates.removed} candidates`);
  if (result.events.archived > 0) actions.push(`archived ${result.events.archived} old events`);
  if (result.prompts.removed > 0) actions.push(`cleaned ${result.prompts.removed} old prompt files (${result.prompts.freedKB}KB)`);
  result.summary = actions.length > 0
    ? `${dryRun ? '[DRY RUN] ' : ''}${actions.join(', ')}`
    : 'Assets clean, nothing to do.';

  return result;
}

/**
 * Heartbeat Check - Unified heartbeat diagnostic in a single call.
 * Replaces 3-5 exec/tool calls that heartbeat sessions typically make.
 * Outputs a clear recommendation: HEARTBEAT_OK or a list of issues.
 * Checks: disk, memory, git dirty, evolution health, cron staleness, today's note.
 * @returns {Promise<Object>} - { ok, issues, metrics, recommendation }
 */
async function heartbeatCheck() {
  const issues = [];
  const metrics = {};
  const ws = '/root/openclaw';

  // 1. Disk usage
  try {
    const diskInfo = await diskUsage();
    const pct = parseInt(diskInfo.usedPercent) || 0;
    metrics.disk = `${pct}%`;
    if (pct >= 90) issues.push(`🔴 Disk critical: ${pct}% used`);
    else if (pct >= 80) issues.push(`🟡 Disk high: ${pct}% used`);
  } catch { metrics.disk = 'unknown'; }

  // 2. System memory
  try {
    const os = require('os');
    const totalMB = Math.round(os.totalmem() / 1048576);
    const freeMB = Math.round(os.freemem() / 1048576);
    const usedPct = Math.round((1 - os.freemem() / os.totalmem()) * 100);
    metrics.memory = `${usedPct}% (${freeMB}MB free / ${totalMB}MB)`;
    if (usedPct >= 95) issues.push(`🔴 Memory critical: ${usedPct}% used`);
    else if (usedPct >= 85) issues.push(`🟡 Memory high: ${usedPct}% used`);
  } catch { metrics.memory = 'unknown'; }

  // 3. Git dirty files
  try {
    const gs = await gitStatus();
    const dirty = (gs.staged || []).length + (gs.modified || []).length + (gs.untracked || []).length;
    metrics.gitDirty = dirty;
    if (dirty >= 50) issues.push(`🟡 Git: ${dirty} uncommitted files (consider committing)`);
  } catch { metrics.gitDirty = 'unknown'; }

  // 4. Today's daily note
  try {
    const today = new Date().toISOString().slice(0, 10);
    const notePath = path.join(ws, `memory/${today}.md`);
    const exists = await fs.access(notePath).then(() => true).catch(() => false);
    metrics.todayNote = exists;
    if (!exists) issues.push(`📝 No daily note for ${today}`);
  } catch { metrics.todayNote = 'unknown'; }

  // 5. Evolution health (lightweight)
  try {
    const evoStats = await evolutionStats();
    metrics.evoSuccessRate = evoStats.successRate;
    metrics.evoStreak = evoStats.consecutiveSuccesses;
    if (evoStats.successRate < 50) issues.push(`🟡 Evolution success rate low: ${evoStats.successRate}%`);
  } catch { metrics.evoSuccessRate = 'unknown'; }

  // 6. Heartbeat state staleness
  try {
    const cronInfo = await cronStats();
    const staleChecks = cronInfo.staleChecks || [];
    if (staleChecks.length > 0) {
      metrics.staleHeartbeats = staleChecks.length;
      // Only flag if >3 stale (minor staleness is normal)
      if (staleChecks.length >= 3) {
        issues.push(`🟡 ${staleChecks.length} stale heartbeat checks`);
      }
    }
  } catch { /* non-critical */ }

  // 7. Uptime
  try {
    const uptime = require('os').uptime();
    const hours = Math.round(uptime / 3600 * 10) / 10;
    metrics.uptime = `${hours}h`;
  } catch {}

  const ok = issues.length === 0;
  return {
    ok,
    recommendation: ok ? 'HEARTBEAT_OK' : `${issues.length} issue(s) found`,
    issues,
    metrics,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  gitStatus,
  gitLog,
  gitDiff,
  gitCommit,
  fileExists,
  dirSize,
  findFiles,
  readLines,
  processInfo,
  batchExec,
  systemHealth,
  skillHealth,
  skillAudit,
  evolverPreflight,
  batchFileCheck,
  fileStatsBatch,
  memoryStats,
  evolutionStats,
  quickDiag,
  logTail,
  cronStats,
  jsonRead,
  grepFiles,
  latestFile,
  diskUsage,
  diskCleanup,
  httpFetch,
  envExec,
  sessionExecAnalysis,
  signalTrend,
  gepMaintain,
  heartbeatCheck,
  main
};

// CLI entry point
if (require.main === module) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
