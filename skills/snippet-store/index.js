/**
 * snippet-store — Lightweight code/text snippet manager
 *
 * Save, tag, search, and retrieve reusable snippets: commands, code patterns,
 * API calls, templates, etc. Stored as a single JSONL file for simplicity.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_STORE = path.join(__dirname, '..', '..', 'memory', 'snippets.jsonl');

/**
 * Get the store file path
 * @param {string} [storePath] - Custom store path
 * @returns {string}
 */
function getStorePath(storePath) {
  return storePath || process.env.SNIPPET_STORE_PATH || DEFAULT_STORE;
}

/**
 * Load all snippets from store
 * @param {string} [storePath]
 * @returns {Array<object>}
 */
function loadAll(storePath) {
  const fp = getStorePath(storePath);
  if (!fs.existsSync(fp)) return [];
  const lines = fs.readFileSync(fp, 'utf-8').trim().split('\n').filter(Boolean);
  const snippets = [];
  for (const line of lines) {
    try { snippets.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return snippets;
}

/**
 * Save a new snippet
 * @param {object} opts
 * @param {string} opts.title - Short title
 * @param {string} opts.content - The snippet content
 * @param {string[]} [opts.tags] - Tags for search
 * @param {string} [opts.lang] - Language hint (bash, js, python, etc.)
 * @param {string} [opts.description] - Optional description
 * @param {string} [opts.storePath]
 * @returns {object} The saved snippet
 */
function save(opts) {
  const { title, content, tags = [], lang = '', description = '', storePath } = opts;
  if (!title || !content) throw new Error('title and content are required');

  const snippet = {
    id: `snip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: title.trim(),
    content,
    tags: tags.map(t => t.toLowerCase().trim()),
    lang: lang.toLowerCase().trim(),
    description: description.trim(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const fp = getStorePath(storePath);
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.appendFileSync(fp, JSON.stringify(snippet) + '\n');
  return snippet;
}

/**
 * Search snippets by query (fuzzy match on title, tags, description, content)
 * @param {string} query - Search query
 * @param {object} [opts]
 * @param {string} [opts.lang] - Filter by language
 * @param {string[]} [opts.tags] - Filter by tags (AND)
 * @param {number} [opts.limit=10] - Max results
 * @param {string} [opts.storePath]
 * @returns {Array<object>} Matching snippets sorted by relevance
 */
function search(query, opts = {}) {
  const { lang, tags, limit = 10, storePath } = opts;
  const all = loadAll(storePath);
  const q = (query || '').toLowerCase().trim();
  const qWords = q.split(/\s+/).filter(Boolean);

  let results = all;

  // Filter by lang if specified
  if (lang) {
    results = results.filter(s => s.lang === lang.toLowerCase());
  }

  // Filter by tags (AND logic)
  if (tags && tags.length > 0) {
    const normTags = tags.map(t => t.toLowerCase().trim());
    results = results.filter(s => normTags.every(t => s.tags.includes(t)));
  }

  // Score by query match
  if (qWords.length > 0) {
    results = results.map(s => {
      let score = 0;
      const haystack = [s.title, s.description, s.content, ...s.tags, s.lang].join(' ').toLowerCase();

      for (const w of qWords) {
        // Exact word match in title gets highest score
        if (s.title.toLowerCase().includes(w)) score += 10;
        // Tag exact match
        if (s.tags.some(t => t === w)) score += 8;
        // Description match
        if ((s.description || '').toLowerCase().includes(w)) score += 5;
        // Content match
        if (s.content.toLowerCase().includes(w)) score += 3;
        // Lang match
        if (s.lang === w) score += 2;
      }

      return { ...s, _score: score };
    })
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score);
  } else {
    // No query, sort by recency
    results = results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  return results.slice(0, limit);
}

/**
 * Get a snippet by ID
 * @param {string} id
 * @param {string} [storePath]
 * @returns {object|null}
 */
function get(id, storePath) {
  return loadAll(storePath).find(s => s.id === id) || null;
}

/**
 * Delete a snippet by ID (rewrites the store without it)
 * @param {string} id
 * @param {string} [storePath]
 * @returns {boolean} true if found and deleted
 */
function remove(id, storePath) {
  const fp = getStorePath(storePath);
  const all = loadAll(storePath);
  const filtered = all.filter(s => s.id !== id);
  if (filtered.length === all.length) return false;
  fs.writeFileSync(fp, filtered.map(s => JSON.stringify(s)).join('\n') + (filtered.length ? '\n' : ''));
  return true;
}

/**
 * List all snippets (optionally filtered by tag or lang)
 * @param {object} [opts]
 * @param {string} [opts.lang]
 * @param {string[]} [opts.tags]
 * @param {number} [opts.limit=20]
 * @param {string} [opts.storePath]
 * @returns {Array<object>}
 */
function list(opts = {}) {
  return search('', opts);
}

/**
 * Format snippets for display
 * @param {Array<object>} snippets
 * @returns {string}
 */
function format(snippets) {
  if (!snippets.length) return 'No snippets found.';
  const lines = [];
  for (const s of snippets) {
    lines.push(`### ${s.title} [${s.id}]`);
    if (s.description) lines.push(`> ${s.description}`);
    if (s.tags.length) lines.push(`Tags: ${s.tags.join(', ')}`);
    if (s.lang) lines.push(`Language: ${s.lang}`);
    lines.push('```' + (s.lang || ''));
    lines.push(s.content);
    lines.push('```');
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Stats about the snippet store
 * @param {string} [storePath]
 * @returns {object}
 */
function stats(storePath) {
  const all = loadAll(storePath);
  const langs = {};
  const tagCounts = {};
  for (const s of all) {
    langs[s.lang || 'none'] = (langs[s.lang || 'none'] || 0) + 1;
    for (const t of s.tags) {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
  }
  return {
    total: all.length,
    languages: langs,
    topTags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10),
  };
}

// CLI mode
if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'help';

  switch (cmd) {
    case 'save': {
      const title = args[1];
      const content = args[2];
      const tags = (args[3] || '').split(',').filter(Boolean);
      const lang = args[4] || '';
      if (!title || !content) {
        console.error('Usage: node index.js save <title> <content> [tags,comma,sep] [lang]');
        process.exit(1);
      }
      const s = save({ title, content, tags, lang });
      console.log(`Saved: ${s.id} — ${s.title}`);
      break;
    }
    case 'search': {
      const q = args.slice(1).join(' ');
      const results = search(q);
      console.log(format(results));
      break;
    }
    case 'list': {
      const results = list({ limit: 20 });
      console.log(format(results));
      break;
    }
    case 'get': {
      const s = get(args[1]);
      if (s) console.log(format([s]));
      else console.log('Not found.');
      break;
    }
    case 'delete': {
      const ok = remove(args[1]);
      console.log(ok ? 'Deleted.' : 'Not found.');
      break;
    }
    case 'stats': {
      console.log(JSON.stringify(stats(), null, 2));
      break;
    }
    default:
      console.log(`snippet-store — Save, search, and manage reusable snippets

Commands:
  save <title> <content> [tags] [lang]  Save a new snippet
  search <query>                        Search snippets
  list                                  List all snippets
  get <id>                              Get snippet by ID
  delete <id>                           Delete snippet by ID
  stats                                 Show store statistics

Examples:
  node index.js save "curl polymarket" "curl -x socks5h://127.0.0.1:7880 https://clob.polymarket.com" "api,polymarket,proxy" "bash"
  node index.js search "polymarket"
  node index.js list
  node index.js stats`);
  }
}

module.exports = { save, search, get, remove, list, format, stats, loadAll };
