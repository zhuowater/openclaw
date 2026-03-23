# exec-optimizer Substitution Quick Reference

Use `node skills/exec-optimizer/index.js <cmd>` for all of these.

| Instead of exec...            | Use CLI...                          | Saves |
|-------------------------------|-------------------------------------|-------|
| `curl -s URL`                 | `fetch <url>` or web_fetch tool     | ~300 tokens |
| `git status --porcelain`      | `diag` (includes git)               | ~200 tokens |
| `git diff`                    | `gitDiff()` API                     | ~200 tokens |
| `git log`                     | `gitLog()` API                      | ~150 tokens |
| `git add -A && git commit`    | `commit "message"`                  | 2→1 calls |
| `ls -t dir \| head -1`       | `latest <dir> [pattern] [count]`    | ~150 tokens |
| `ls -la file1 file2 ...`     | `fstats <path1> <path2> ...`        | N→1 calls |
| `ls dir`                      | read tool on directory              | ~100 tokens |
| `tail -n 20 file`            | `tail <file> [lines]`               | ~100 tokens |
| `head -n 20 file`            | read tool with limit parameter      | ~100 tokens |
| `sed -n '10,20p' file`       | read tool with offset/limit         | ~100 tokens |
| `grep -r pattern dir`        | `grep <dir> <pattern> [exts]`       | ~200 tokens |
| `grep pattern file`          | `grep <dir> <pattern>` or read tool | ~150 tokens |
| `cat file`                   | read tool                           | ~100 tokens |
| `cat file.json`              | `json <file> [dot.path]`            | ~100 tokens |
| `df -h`                      | `disk [path]`                       | ~100 tokens |
| `free -m && df -h && uptime` | `health`                            | 3→1 calls |
| `du -sh dir`                 | `disk [path]`                       | ~100 tokens |
| `stat file`                  | `fstats <paths...>`                 | ~100 tokens |
| `find dir -name pattern`     | `findFiles()` API                   | ~150 tokens |
| `uptime`                     | `health` (includes uptime)          | ~100 tokens |
| `wc -l file`                 | read tool with line count           | ~100 tokens |
| Multiple independent cmds     | Use `batchExec()` programmatically  | N→1 calls |

## Combined Diagnostics (Biggest Wins)

| Pattern                           | One-liner                           | Replaces |
|-----------------------------------|-------------------------------------|----------|
| Session startup checks            | `diag`                              | 3-5 calls |
| Evolver pre-flight                | `preflight`                         | 5-7 calls |
| Memory/notes overview             | `memory`                            | 4-5 calls |
| Evolution health check            | `evo`                               | 3-4 calls |
| Skill audit (all skills)          | `skill-audit` or `skill-audit --deep` | 10+ calls |
| Heartbeat state check             | `cron`                              | 2-3 calls |
| Safe disk cleanup                 | `cleanup` or `cleanup --dry-run`    | 5-10 calls |
| GEP asset maintenance             | `gep-maintain`                      | 3-5 calls |
| Analyze exec usage                | `exec-analysis [count]`             | 5-10 calls |
| Multiple checks at once           | `batch health,evo,git`              | N→1 calls |
| Find substitution for a command   | `suggest "git status && df -h"`     | learning tool |
