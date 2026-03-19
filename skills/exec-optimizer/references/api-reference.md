# exec-optimizer Full API Reference

Detailed documentation for all exec-optimizer functions. Load this only when you need specific usage examples.

## Batch Operations

```javascript
const { batchExec, systemHealth, skillHealth } = require('./skills/exec-optimizer');

// Run multiple commands in one call (replaces 3-5 separate exec calls)
const batch = await batchExec([
  'git status --porcelain',
  'wc -l memory/2026-03-02.md',
  { cmd: 'node -v', label: 'node_version' }
], { stopOnError: false });
// Returns: { results: [{label, cmd, ok, stdout, stderr, exitCode}], summary: "3 commands: 3 ok, 0 failed" }

// Quick system health check (replaces 5 exec calls with 1)
const health = await systemHealth();
// Returns: { uptime, memory, disk, nodeProcesses, gitDirtyFiles }

// Check skill integrity
const check = await skillHealth('exec-optimizer');
// Returns: { name, hasIndex, hasSkillMd, hasPkg, importable, issues }
```

## Git Operations

```javascript
const { gitStatus, gitLog, gitDiff, gitCommit } = require('./skills/exec-optimizer');

// Check git status (replaces: exec('git status'))
const status = await gitStatus();
// Returns: { clean: boolean, staged: string[], modified: string[], untracked: string[] }

// Get recent commits (replaces: exec('git log --oneline -n 5'))
const commits = await gitLog(5);
// Returns: [{ hash: string, message: string, author: string, date: string }]

// Get diff summary (replaces: exec('git diff --stat'))
const diff = await gitDiff();
// Returns: { files: number, insertions: number, deletions: number }

// Stage and commit in one call (replaces: exec('git add -A') + exec('git commit -m "..."'))
const commit = await gitCommit('feat: add new feature', { files: 'all' });
// Returns: { ok: true, hash: 'abc1234', message: '...', filesChanged: 3 }
// Or stage specific files:
const commit2 = await gitCommit('fix: bug', { files: ['src/index.js', 'README.md'] });
```

## File System Operations

```javascript
const { fileExists, dirSize, findFiles, readLines } = require('./skills/exec-optimizer');

// Check file existence (replaces: exec('test -f /path/to/file'))
const exists = await fileExists('/path/to/file');

// Get directory size (replaces: exec('du -sh /path'))
const size = await dirSize('/path');
// Returns: { bytes: number, human: string }

// Find files by pattern (replaces: exec('find /path -name "*.js"'))
const files = await findFiles('/path', '*.js', { limit: 100 });

// Read specific lines (replaces: exec('head -n 10 /file'))
const lines = await readLines('/file', { start: 1, count: 10 });
```

## Process Operations

```javascript
const { processInfo } = require('./skills/exec-optimizer');

// Get process info (replaces: exec('ps aux | grep node'))
const procs = await processInfo('node');
// Returns: [{ pid: number, cpu: number, mem: number, command: string }]
```

## File Stats Batch

```javascript
const { fileStatsBatch } = require('./skills/exec-optimizer');

// Batch stat multiple files in one call
const stats = await fileStatsBatch(['/root/openclaw/MEMORY.md', '/root/openclaw/SOUL.md', '/foo/bar']);
// Returns: [{ path, exists: true, size, mtime, isDir }, { path, exists: false }]
```

## Evolver Preflight

```javascript
const { evolverPreflight } = require('./skills/exec-optimizer');

// Single call replaces: gitStatus + systemHealth + gitLog + gitDiff + dirSize + fileRead
const preflight = await evolverPreflight();
// Returns: { system, git, recentCommits, diff, diskWarning, assetsSize, eventCount, ready, summary }
```

## Batch File Check

```javascript
const { batchFileCheck } = require('./skills/exec-optimizer');

const check = await batchFileCheck([
  '/root/openclaw/MEMORY.md',
  '/root/openclaw/skills/evolver/index.js',
  '/root/openclaw/skills/missing-skill/index.js'
]);
// Returns: { results: {path: bool}, allExist: false, missing: ['...missing-skill...'] }
```

## Grep Files

```javascript
const { grepFiles } = require('./skills/exec-optimizer');
const results = await grepFiles('/root/openclaw', 'TODO', {
  extensions: ['.js', '.md'], maxDepth: 3, maxResults: 50
});
// Returns: [{ file: '/path/to/file.js', line: 42, text: '// TODO: fix this' }]
```

## Latest File

```javascript
const { latestFile } = require('./skills/exec-optimizer');
const latest = await latestFile('/root/openclaw/memory', { pattern: '*.md', count: 3 });
// Returns: [{ name: '2026-03-08.md', path: '...', mtime: '...', size: 1234 }]
```

## Disk Usage

```javascript
const { diskUsage } = require('./skills/exec-optimizer');
const disk = await diskUsage('/');
// Returns: { total: '42.0G', used: '27.2G', available: '14.8G', usedPercent: '64.8%', path: '/' }
```

## Memory Stats

```javascript
const { memoryStats } = require('./skills/exec-optimizer');

// Single call: MEMORY.md lines + daily notes list + archives + total size + stale count
const stats = await memoryStats();
// Returns: { memoryMd: {lines, bytes, lastModified}, dailyNotes: [...], archives: [...],
//            totalSize: {bytes, human}, recentNotes: [...], staleCount, summary }
```

## Evolution Stats

```javascript
const { evolutionStats } = require('./skills/exec-optimizer');

// Single call: event count + gene/capsule counts + success rate + streak
const evo = await evolutionStats();
// Returns: { eventCount, geneCount, capsuleCount, lastEvent, recentEvents,
//            successRate, consecutiveSuccesses, summary }
```

## HTTP Fetch

```javascript
const { httpFetch } = require('./skills/exec-optimizer');

// Simple GET (replaces: exec('curl -s https://api.example.com/data'))
const res = await httpFetch('https://api.example.com/data');
// Returns: { ok, status, headers, body, elapsed }

// POST with retry
const res2 = await httpFetch('https://api.example.com/submit', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer token' },
  body: { key: 'value' },
  retries: 2,
  retryDelayMs: 1000
});
```

## Env Exec

```javascript
const { envExec } = require('./skills/exec-optimizer');

// Replaces: exec('SKYEYE_API_KEY=xxx node script.js --flag')
const result = await envExec('node script.js --flag', {
  SKYEYE_API_KEY: 'xxx',
  OTHER_VAR: 'yyy'
});
// Returns: { ok, stdout, stderr, exitCode }
```

## Session Exec Analysis

```javascript
const { sessionExecAnalysis } = require('./skills/exec-optimizer');

const analysis = await sessionExecAnalysis(null, 10);
// Returns: { sessionsAnalyzed, totalExecCalls, commandPatterns, optimizableCount, suggestions }
```

## Signal Trend Analysis (GEP)

```javascript
const { signalTrend } = require('./skills/exec-optimizer');

const trend = await signalTrend(10);
// Returns: { analyzed, signalFrequency, geneFrequency, intentBreakdown,
//   repeatedSignals, stagnation, streak, trend, recommendations, summary }
```
