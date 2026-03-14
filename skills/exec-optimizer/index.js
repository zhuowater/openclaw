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
  console.log('  node index.js fetch <url> - HTTP fetch without curl (replaces exec curl)');
  console.log('  node index.js exec-analysis [n] - Analyze exec patterns in recent sessions');
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
  main
};

// CLI entry point
if (require.main === module) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
