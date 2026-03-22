---
name: log-watcher
description: Lightweight log tailing, searching, error extraction, and JSONL parsing. Replaces repeated exec grep/tail/cat calls with a single Node.js invocation. Use when you need to tail logs, search for errors, check recent log files, parse JSONL session logs, or scan for exceptions. Triggers on "check logs", "find errors", "tail log", "recent logs", "parse jsonl", "log search", "查日志", "看日志".
---

# log-watcher

Replace 3-5 exec calls (grep, tail, cat, ls -t, wc -l) with a single Node.js invocation.

## Commands

```bash
# Tail a file (last 20 lines)
node skills/log-watcher/index.js tail /path/to/file.log

# Tail with more lines
node skills/log-watcher/index.js tail /path/to/file.log --lines 50

# Search for pattern across directories
node skills/log-watcher/index.js search /root/.openclaw/logs -p "error|failed"

# Search with context lines
node skills/log-watcher/index.js search /root/.openclaw/logs -p "timeout" -C 3

# Find errors in recent logs (default: last 1h)
node skills/log-watcher/index.js errors /root/.openclaw/logs --since 2h

# Include warnings
node skills/log-watcher/index.js errors /root/.openclaw/logs --level warn

# File stats (sizes, line counts, ages)
node skills/log-watcher/index.js stats /root/.openclaw/logs

# Recently modified files
node skills/log-watcher/index.js recent /root/.openclaw/logs --since 6h

# Parse JSONL (e.g., session logs, evolution events)
node skills/log-watcher/index.js jsonl /path/to/events.jsonl --lines 5
node skills/log-watcher/index.js jsonl /path/to/events.jsonl --pattern "error"
```

## Token Savings

| Before (exec calls) | After (log-watcher) | Savings |
|---------------------|---------------------|---------|
| `tail -20 file` + `grep error file` + `wc -l file` | `errors /dir --since 1h` | 3 → 1 |
| `ls -t dir \| head` + `tail file` | `recent dir` + `tail file` | Already 1 |
| `grep -rn pattern dir` | `search dir -p pattern` | 1 → 1 (but structured output) |
| `cat file.jsonl \| jq .` | `jsonl file` | 1 → 1 (no jq needed) |

## Programmatic Use

```javascript
const { tail, search, errors, stats, recent, jsonl } = require('./skills/log-watcher');

const result = await errors(['/root/.openclaw/logs'], { since: '2h' });
console.log(result.total_errors, result.by_severity);
```
