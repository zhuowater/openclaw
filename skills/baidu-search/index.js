/**
 * baidu-search skill — resilient wrapper around mcporter baidu-search MCP.
 * Handles retries, timeouts, and provides structured JSON output.
 */
'use strict';

const { execSync } = require('child_process');

const MAX_RETRIES = 2;
const TIMEOUT_MS = 30000;

/**
 * Search Baidu AI via mcporter.
 * @param {string} query - Search query (natural language, Chinese preferred)
 * @param {object} [opts] - Options
 * @param {string} [opts.model] - LLM summarization model (e.g. "ERNIE-3.5-8K")
 * @param {string} [opts.instruction] - Output format instruction
 * @param {number} [opts.retries] - Max retries (default 2)
 * @param {number} [opts.timeoutMs] - Timeout per attempt in ms (default 30000)
 * @returns {{ ok: boolean, results: string, error?: string }}
 */
function search(query, opts = {}) {
  if (!query || typeof query !== 'string') {
    return { ok: false, results: '', error: 'query is required and must be a string' };
  }

  const retries = opts.retries ?? MAX_RETRIES;
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;

  // Build mcporter command
  const args = [`query=${JSON.stringify(query)}`];
  if (opts.model) args.push(`model=${JSON.stringify(opts.model)}`);
  if (opts.instruction) args.push(`instruction=${JSON.stringify(opts.instruction)}`);

  const cmd = `mcporter call baidu-search.AIsearch ${args.join(' ')}`;

  let lastError = '';
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const out = execSync(cmd, {
        timeout: timeoutMs,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
        cwd: '/root/openclaw',  // Avoid CWD conflict with local package.json name
      });
      return { ok: true, results: out.trim() };
    } catch (err) {
      lastError = err.stderr?.trim() || err.message || String(err);
      // Only retry on transient errors (connection, timeout)
      // "Unknown MCP server" is NOT transient — it means config resolution failed
      const transient = /timeout|ECONNREFUSED|ENOTFOUND/i.test(lastError);
      if (!transient || attempt >= retries) break;
      // Brief back-off
      const delay = (attempt + 1) * 1000;
      execSync(`sleep ${delay / 1000}`);
    }
  }

  return { ok: false, results: '', error: `baidu-search failed after ${retries + 1} attempts: ${lastError}` };
}

/**
 * CLI entry: node index.js "搜索关键词" [--model ERNIE-3.5-8K] [--instruction "..."]
 */
function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help') {
    console.log('Usage: node index.js "query" [--model MODEL] [--instruction TEXT]');
    console.log('Example: node index.js "最新CVE漏洞" --model ERNIE-3.5-8K');
    process.exit(0);
  }

  const query = args[0];
  const opts = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--model' && args[i + 1]) { opts.model = args[++i]; }
    else if (args[i] === '--instruction' && args[i + 1]) { opts.instruction = args[++i]; }
    else if (args[i] === '--limit' && args[i + 1]) { /* ignored — baidu API has no limit param */ i++; }
  }

  const result = search(query, opts);
  if (result.ok) {
    console.log(result.results);
  } else {
    console.error(`ERROR: ${result.error}`);
    process.exit(1);
  }
}

// Auto-run if called directly
if (require.main === module) {
  main();
}

module.exports = { search, main };
