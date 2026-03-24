---
name: exec-optimizer
description: Reduce exec tool usage by providing lightweight Node.js wrappers for common shell operations like git status, file checks, directory operations, HTTP requests, and disk maintenance. Use INSTEAD OF exec for curl, git status, ls, tail, grep, df, du, cat .json. Use `node skills/exec-optimizer/index.js diag` for session startup checks (replaces 3-5 exec calls). Use `node skills/exec-optimizer/index.js health` for system health. Ref table at references/exec-substitution-table.md. Full API docs at references/api-reference.md.
---

# exec-optimizer

Replace heavy `exec` shell calls with lightweight Node.js native operations. ~60% token savings, ~40% latency reduction.

## Quick CLI Reference

All commands: `node skills/exec-optimizer/index.js <cmd>`

| Command | Replaces | Saves |
|---------|----------|-------|
| `diag` | git status + system checks + memory | 3-5 → 1 call |
| `diag --evo` | diag + evolution stats | 5-7 → 1 call |
| `preflight` | evolver pre-flight checks | 5-7 → 1 call |
| `health` | free + df + uptime | 3 → 1 call |
| `commit "msg"` | git add + git commit | 2 → 1 call |
| `latest <dir> [pat] [n]` | ls -t \| head | ~150 tokens |
| `grep <dir> <pat> [exts]` | grep -r | ~200 tokens |
| `disk [path]` | df -h | ~100 tokens |
| `memory` | ls + wc + du + stat on notes | 4-5 → 1 call |
| `evo` | event/gene/capsule counting | 3-4 → 1 call |
| `fstats <paths...>` | multiple stat/ls -la | N → 1 call |
| `cleanup [--dry-run]` | manual du/find/rm | 5-10 → 1 call |
| `gep-maintain [--dry-run]` | dedup candidates + archive events + clean old prompts | 3-5 → 1 call |
| `exec-analysis [count]` | analyze exec patterns | 5-10 → 1 call |
| `skill <name>` | check skill integrity | 2-3 → 1 call |
| `heartbeat-check` / `hb` | disk + memory + git + evo + cron staleness | 3-5 → 1 call |
| `batch cmd1,cmd2,...` | combine multiple checks in one call | N → 1 call |
| `suggest "cmd"` | suggest exec-optimizer alternative for a command | learning tool |

## Programmatic API (require)

```javascript
const eo = require('./skills/exec-optimizer');
```

**Key functions** (all async):

| Function | Purpose |
|----------|---------|
| `gitStatus(cwd)` | Structured git status |
| `gitLog(n, cwd)` | Recent commits |
| `gitCommit(msg, {files})` | Stage + commit |
| `fileExists(path)` | Check existence |
| `readLines(path, {start,count})` | Read specific lines |
| `findFiles(dir, pattern)` | Find by glob |
| `batchExec(cmds, opts)` | Multiple commands in one |
| `systemHealth()` | Uptime/memory/disk/processes |
| `httpFetch(url, opts)` | HTTP with retry |
| `memoryStats()` | Memory system overview |
| `evolutionStats()` | GEP evolution metrics |
| `signalTrend(n)` | Signal frequency analysis |
| `evolverPreflight()` | Full evolver readiness check |
| `grepFiles(dir, pat, opts)` | Search file contents |
| `latestFile(dir, opts)` | Most recent files |
| `diskUsage(path)` | Disk space info |
| `fileStatsBatch(paths)` | Batch stat multiple files |
| `envExec(cmd, envVars)` | Exec with env vars |

> **Full API docs with examples**: `references/api-reference.md`
> **Substitution table**: `references/exec-substitution-table.md`

## When to Use vs exec

✅ **Use exec-optimizer**: git status, file checks, curl, grep, ls, tail, df, du, cat .json, batch operations
❌ **Still use exec**: interactive commands, complex pipelines, TTY-required CLIs, platform-specific tools

## Safety

- Respects forbidden paths
- No destructive ops without confirmation
- Structured error handling
- Async/non-blocking
