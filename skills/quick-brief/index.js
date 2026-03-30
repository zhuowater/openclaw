/**
 * quick-brief — Rapid situational awareness briefing
 * 
 * Pulls from web search, local memory files, and optional X/Twitter
 * to produce a concise actionable briefing on any topic in <30 seconds.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.resolve(__dirname, '../../memory');
const MEMORY_MD = path.resolve(__dirname, '../../MEMORY.md');

/**
 * Search local memory files for topic-relevant content
 */
function searchMemory(topic, opts = {}) {
  const results = [];
  const topicLower = topic.toLowerCase();
  const keywords = topicLower.split(/\s+/).filter(w => w.length > 2);
  
  // Search MEMORY.md
  try {
    const content = fs.readFileSync(MEMORY_MD, 'utf8');
    const lines = content.split('\n');
    const matches = [];
    for (let i = 0; i < lines.length; i++) {
      const lineLower = lines[i].toLowerCase();
      if (keywords.some(kw => lineLower.includes(kw))) {
        // Grab context: 2 lines before and after
        const start = Math.max(0, i - 2);
        const end = Math.min(lines.length, i + 3);
        matches.push(lines.slice(start, end).join('\n'));
      }
    }
    if (matches.length > 0) {
      results.push({ source: 'MEMORY.md', snippets: dedup(matches).slice(0, 5) });
    }
  } catch (e) { /* ignore */ }

  // Search recent daily notes (last 7 days)
  try {
    const files = fs.readdirSync(MEMORY_DIR)
      .filter(f => f.match(/^2026-\d{2}-\d{2}\.md$/))
      .sort()
      .reverse()
      .slice(0, 7);

    for (const file of files) {
      const content = fs.readFileSync(path.join(MEMORY_DIR, file), 'utf8');
      const lines = content.split('\n');
      const matches = [];
      for (let i = 0; i < lines.length; i++) {
        const lineLower = lines[i].toLowerCase();
        if (keywords.some(kw => lineLower.includes(kw))) {
          const start = Math.max(0, i - 2);
          const end = Math.min(lines.length, i + 3);
          matches.push(lines.slice(start, end).join('\n'));
        }
      }
      if (matches.length > 0) {
        results.push({ source: file, snippets: dedup(matches).slice(0, 3) });
      }
    }
  } catch (e) { /* ignore */ }

  // Search archive files
  try {
    const archives = fs.readdirSync(MEMORY_DIR)
      .filter(f => f.startsWith('archive-'))
      .sort()
      .reverse();

    for (const file of archives.slice(0, 3)) {
      const content = fs.readFileSync(path.join(MEMORY_DIR, file), 'utf8');
      const lines = content.split('\n');
      const matches = [];
      for (let i = 0; i < lines.length; i++) {
        const lineLower = lines[i].toLowerCase();
        if (keywords.some(kw => lineLower.includes(kw))) {
          const start = Math.max(0, i - 1);
          const end = Math.min(lines.length, i + 2);
          matches.push(lines.slice(start, end).join('\n'));
        }
      }
      if (matches.length > 0) {
        results.push({ source: file, snippets: dedup(matches).slice(0, 3) });
      }
    }
  } catch (e) { /* ignore */ }

  return results;
}

/**
 * Remove near-duplicate snippets
 */
function dedup(snippets) {
  const seen = new Set();
  return snippets.filter(s => {
    const normalized = s.replace(/\s+/g, ' ').trim().slice(0, 100);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

/**
 * Search web using available search tools
 */
function searchWeb(topic) {
  try {
    // Try brave search via curl (available as web_search tool in agent context)
    const encoded = encodeURIComponent(topic);
    const result = execSync(
      `curl -s "https://api.search.brave.com/res/v1/web/search?q=${encoded}&count=5" -H "Accept: application/json" -H "Accept-Encoding: gzip" 2>/dev/null | head -c 5000`,
      { timeout: 15000, encoding: 'utf8' }
    );
    if (result && result.includes('"web"')) {
      const parsed = JSON.parse(result);
      if (parsed.web && parsed.web.results) {
        return parsed.web.results.map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.description
        })).slice(0, 5);
      }
    }
  } catch (e) { /* web search not available via direct curl, that's fine */ }
  
  return [];
}

/**
 * Assess overall sentiment from collected snippets
 */
function assessSentiment(allSnippets) {
  const text = allSnippets.join(' ').toLowerCase();
  const positive = ['success', 'progress', 'improvement', 'growth', 'positive', 'ceasefire', 'agreement', 'up', 'bullish', '成功', '进展', '改善', '利好'];
  const negative = ['fail', 'attack', 'threat', 'risk', 'crisis', 'war', 'down', 'bearish', 'vulnerability', 'exploit', '威胁', '风险', '攻击', '危机', '失败'];
  
  let posScore = 0, negScore = 0;
  for (const w of positive) if (text.includes(w)) posScore++;
  for (const w of negative) if (text.includes(w)) negScore++;
  
  if (posScore > negScore + 2) return 'positive';
  if (negScore > posScore + 2) return 'negative';
  if (posScore > 0 && negScore > 0) return 'mixed';
  return 'neutral';
}

/**
 * Main brief function
 * @param {string} topic - Topic to brief on
 * @param {object} opts - Options: sources (array), depth (string), format (string)
 * @returns {object} Brief result
 */
async function brief(topic, opts = {}) {
  const startTime = Date.now();
  const sources = opts.sources || ['web', 'memory'];
  const format = opts.format || 'text';
  
  const memoryResults = sources.includes('memory') ? searchMemory(topic) : [];
  const webResults = sources.includes('web') ? searchWeb(topic) : [];
  
  // Collect all snippets for analysis
  const allSnippets = [];
  for (const mr of memoryResults) {
    allSnippets.push(...mr.snippets);
  }
  for (const wr of webResults) {
    allSnippets.push(wr.snippet || '');
  }

  const sentiment = assessSentiment(allSnippets);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  // Calculate confidence based on source coverage
  let confidence = 0;
  if (memoryResults.length > 0) confidence += 0.4;
  if (webResults.length > 0) confidence += 0.4;
  if (allSnippets.length > 5) confidence += 0.1;
  if (allSnippets.length > 10) confidence += 0.1;
  confidence = Math.min(1, confidence);
  
  const confidenceLabel = confidence >= 0.7 ? 'high' : confidence >= 0.4 ? 'medium' : 'low';
  
  const result = {
    topic,
    summary: allSnippets.slice(0, 5).join('\n').slice(0, 1000),
    keyFacts: allSnippets.slice(0, 8).map(s => s.split('\n')[0].trim()).filter(Boolean).slice(0, 6),
    sentiment,
    confidence,
    confidenceLabel,
    sources: {
      memory: memoryResults.length,
      web: webResults.length,
      total: memoryResults.length + webResults.length
    },
    rawMemory: memoryResults,
    rawWeb: webResults,
    elapsed: `${elapsed}s`
  };

  if (format === 'json') return result;

  // Text format
  const keyFactsStr = result.keyFacts.map(f => `• ${f}`).join('\n');
  result.formatted = [
    `📋 BRIEF: ${topic}`,
    '━━━━━━━━━━━━━━━━━━━━━━',
    `📌 Summary: ${result.summary.slice(0, 500)}`,
    '',
    '🔑 Key Facts:',
    keyFactsStr || '• No specific facts found — consider expanding search',
    '',
    `📊 Sentiment: ${sentiment}`,
    `🎯 Confidence: ${confidenceLabel} (${(confidence * 100).toFixed(0)}%)`,
    `📡 Sources: memory: ${result.sources.memory}, web: ${result.sources.web}`,
    `⏱️ Generated in: ${elapsed}s`,
    '━━━━━━━━━━━━━━━━━━━━━━'
  ].join('\n');
  
  return result;
}

/**
 * CLI entrypoint
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help') {
    console.log('Usage: node index.js "topic" [--sources web,memory,x] [--depth shallow|normal] [--format text|json]');
    console.log('');
    console.log('Examples:');
    console.log('  node index.js "Iran war ceasefire"');
    console.log('  node index.js "BTC price" --format json');
    console.log('  node index.js "polymarket" --sources memory');
    process.exit(0);
  }

  const topic = args[0];
  const opts = {};
  
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--sources' && args[i + 1]) {
      opts.sources = args[++i].split(',');
    } else if (args[i] === '--depth' && args[i + 1]) {
      opts.depth = args[++i];
    } else if (args[i] === '--format' && args[i + 1]) {
      opts.format = args[++i];
    }
  }

  const result = await brief(topic, opts);
  
  if (opts.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.formatted);
  }
}

module.exports = { brief, searchMemory, searchWeb, main };

if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
