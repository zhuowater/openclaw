/**
 * web-search-fallback — Unified search router with automatic fallback.
 *
 * Priority chain:
 *   1. Brave Search (via web_search tool) — fast, structured
 *   2. Grok web_search (via Skyeye Responses API) — server-side, no local proxy needed
 *   3. Baidu AI Search (via mcporter) — best for Chinese queries
 *
 * When Brave API key is missing, automatically routes to Grok or Baidu.
 * Provides a consistent output format regardless of backend.
 */
'use strict';

const { execSync } = require('child_process');
const https = require('https');

const SKYEYE_KEY = process.env.SKYEYE_API_KEY || '';
const API_BASE = process.env.GROK_API_BASE || 'https://api.skyeye.net/v1';
const GROK_MODEL = 'grok-4-1-fast-reasoning';
const TIMEOUT_MS = 30000;

// ---- Grok Responses API (server-side web_search) ----

function grokWebSearch(query, count = 8) {
  return new Promise((resolve, reject) => {
    if (!SKYEYE_KEY) {
      return reject(new Error('SKYEYE_API_KEY not set'));
    }

    const body = JSON.stringify({
      model: GROK_MODEL,
      input: `Search the web for: "${query}". Return the top ${count} results as a JSON array. Each result must have: title, url, description. Output ONLY valid JSON array, no markdown, no explanation.`,
      tools: [{ type: 'web_search' }],
      temperature: 0.1,
      instructions: 'You are a web search tool. Return results as a JSON array of {title, url, description}. Output ONLY the JSON array. No markdown code blocks.'
    });

    const opts = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SKYEYE_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: TIMEOUT_MS
    };

    const req = https.request(`${API_BASE}/responses`, opts, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try {
          const data = JSON.parse(buf);
          if (data.error) return reject(new Error(JSON.stringify(data.error)));

          // Extract text from output
          let text = '';
          for (const item of (data.output || [])) {
            for (const c of (item.content || [])) {
              if (c.type === 'output_text') text += c.text;
            }
          }

          // Try to parse as JSON array
          let results = [];
          try {
            // Strip markdown code blocks if present
            const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
            const parsed = JSON.parse(cleaned);
            results = Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            // If not valid JSON, return as single text result
            results = [{ title: 'Grok Web Search Result', url: '', description: text.substring(0, 500) }];
          }

          resolve({
            ok: true,
            results: results.slice(0, count).map(r => ({
              title: r.title || '',
              url: r.url || '',
              description: r.description || r.snippet || ''
            })),
            query,
            source: 'grok-web-search',
            usage: data.usage || {}
          });
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

// ---- Baidu AI Search (via mcporter) ----

function baiduSearch(query) {
  try {
    const cmd = `mcporter call baidu-search.AIsearch query="${query.replace(/"/g, '\\"')}" 2>&1`;
    const out = execSync(cmd, { timeout: TIMEOUT_MS, encoding: 'utf-8' });

    return {
      ok: true,
      results: [{ title: 'Baidu AI Search', url: '', description: out.trim().substring(0, 2000) }],
      query,
      source: 'baidu-ai-search'
    };
  } catch (err) {
    return { ok: false, results: [], error: err.message, query, source: 'baidu-ai-search' };
  }
}

// ---- Unified Search Router ----

/**
 * Search with automatic fallback.
 * @param {string} query - Search query
 * @param {object} [opts] - Options
 * @param {number} [opts.count] - Max results (default 8)
 * @param {string} [opts.prefer] - Preferred backend: 'grok' | 'baidu' | 'auto' (default: auto)
 * @param {string} [opts.lang] - Language hint: 'zh' for Chinese, 'en' for English
 * @returns {Promise<{ok: boolean, results: Array, source: string, query: string}>}
 */
async function search(query, opts = {}) {
  if (!query || typeof query !== 'string') {
    return { ok: false, results: [], error: 'query is required' };
  }

  const count = opts.count || 8;
  const prefer = opts.prefer || 'auto';
  const lang = opts.lang || (isChinese(query) ? 'zh' : 'en');

  // Auto-detect: Chinese queries prefer Baidu, English prefer Grok
  const backends = [];
  if (prefer === 'baidu') {
    backends.push('baidu', 'grok');
  } else if (prefer === 'grok') {
    backends.push('grok', 'baidu');
  } else {
    // auto
    if (lang === 'zh') {
      backends.push('baidu', 'grok');
    } else {
      backends.push('grok', 'baidu');
    }
  }

  for (const backend of backends) {
    try {
      if (backend === 'grok' && SKYEYE_KEY) {
        const result = await grokWebSearch(query, count);
        if (result.ok && result.results.length > 0) return result;
      } else if (backend === 'baidu') {
        const result = baiduSearch(query);
        if (result.ok && result.results.length > 0) return result;
      }
    } catch (err) {
      // Continue to next backend
      if (process.env.DEBUG) console.error(`  [${backend}] failed: ${err.message}`);
    }
  }

  return { ok: false, results: [], error: 'All search backends failed', query };
}

/**
 * Simple CJK detection.
 */
function isChinese(text) {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text);
}

// ---- CLI ----

if (require.main === module) {
  const args = process.argv.slice(2);
  const opts = {};
  const parts = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prefer') opts.prefer = args[++i];
    else if (args[i] === '--lang') opts.lang = args[++i];
    else if (args[i] === '--count') opts.count = parseInt(args[++i]);
    else parts.push(args[i]);
  }

  const query = parts.join(' ');
  if (!query) {
    console.error('Usage: node index.js "query" [--prefer grok|baidu|auto] [--lang en|zh] [--count N]');
    process.exit(1);
  }

  search(query, opts).then(r => console.log(JSON.stringify(r, null, 2)));
}

module.exports = { search, grokWebSearch, baiduSearch, isChinese };
