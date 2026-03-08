#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- Config ---
const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../..');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const MEMORY_MD = path.join(WORKSPACE, 'MEMORY.md');
const INDEX_PATH = path.join(MEMORY_DIR, 'evolution', '.memory-index.json');
const MAX_RESULTS = 20;

// Common English + Chinese stop words
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'both', 'each', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and', 'or',
  'if', 'while', 'about', 'up', 'it', 'its', 'this', 'that', 'these',
  'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him',
  'his', 'she', 'her', 'they', 'them', 'their', 'what', 'which', 'who',
  'whom', 'this', 'that', 'am',
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
  '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
  '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '那'
]);

// --- Tokenizer ---
function tokenize(text) {
  // Split on non-word chars, keep CJK chars individually, lowercase
  const raw = text.toLowerCase()
    .replace(/[`~!@#$%^&*()_\-+=\[\]{};:'",.<>/?\\|]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
  return raw;
}

// --- Collect memory files ---
function collectFiles() {
  const files = [];
  
  // MEMORY.md
  if (fs.existsSync(MEMORY_MD)) {
    files.push(MEMORY_MD);
  }
  
  // memory/*.md (including subdirs like memory/archive-*.md, memory/threat-reports/*.md)
  function scanDir(dir, depth = 0) {
    if (depth > 2) return; // limit recursion
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('.')) {
          files.push(fullPath);
        } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'evolution') {
          scanDir(fullPath, depth + 1);
        }
      }
    } catch (e) { /* ignore */ }
  }
  
  scanDir(MEMORY_DIR);
  return files;
}

// --- Build fingerprint for staleness check ---
function computeFingerprint(files) {
  const hash = crypto.createHash('md5');
  for (const f of files) {
    try {
      const stat = fs.statSync(f);
      hash.update(`${f}:${stat.mtimeMs}:${stat.size}\n`);
    } catch (e) {
      hash.update(`${f}:missing\n`);
    }
  }
  return hash.digest('hex');
}

// --- Build inverted index ---
function buildIndex() {
  const start = Date.now();
  const files = collectFiles();
  const fingerprint = computeFingerprint(files);
  
  // Check if index is fresh
  if (fs.existsSync(INDEX_PATH)) {
    try {
      const existing = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
      if (existing.fingerprint === fingerprint) {
        return {
          indexed: existing.fileCount,
          terms: existing.termCount,
          elapsed: '0ms (cached)',
          cached: true
        };
      }
    } catch (e) { /* rebuild */ }
  }
  
  // inverted index: term → [{file: relPath, line: number, freq: number}]
  const index = {};
  let totalTerms = 0;
  const fileMeta = {}; // relPath → { lines, terms }
  
  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relPath = path.relative(WORKSPACE, filePath);
      const lines = content.split('\n');
      const fileTermCount = {};
      
      for (let i = 0; i < lines.length; i++) {
        const tokens = tokenize(lines[i]);
        for (const token of tokens) {
          if (!fileTermCount[token]) fileTermCount[token] = { firstLine: i + 1, freq: 0 };
          fileTermCount[token].freq++;
        }
      }
      
      fileMeta[relPath] = { lines: lines.length, terms: Object.keys(fileTermCount).length };
      
      for (const [term, info] of Object.entries(fileTermCount)) {
        if (!index[term]) index[term] = [];
        index[term].push({ file: relPath, line: info.firstLine, freq: info.freq });
        totalTerms++;
      }
    } catch (e) { /* skip unreadable */ }
  }
  
  // Persist
  const indexData = {
    version: 1,
    fingerprint,
    builtAt: new Date().toISOString(),
    fileCount: files.length,
    termCount: Object.keys(index).length,
    postingCount: totalTerms,
    fileMeta,
    index
  };
  
  try {
    fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
    fs.writeFileSync(INDEX_PATH, JSON.stringify(indexData), 'utf-8');
  } catch (e) {
    // non-fatal: works without persistence
  }
  
  const elapsed = Date.now() - start;
  return {
    indexed: files.length,
    terms: Object.keys(index).length,
    postings: totalTerms,
    elapsed: `${elapsed}ms`,
    cached: false
  };
}

// --- Search ---
function search(query, topK = MAX_RESULTS) {
  // Ensure index exists
  if (!fs.existsSync(INDEX_PATH)) {
    buildIndex();
  }
  
  let indexData;
  try {
    indexData = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
  } catch (e) {
    buildIndex();
    indexData = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
  }
  
  // Check freshness, rebuild if stale
  const files = collectFiles();
  const currentFp = computeFingerprint(files);
  if (currentFp !== indexData.fingerprint) {
    buildIndex();
    indexData = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
  }
  
  const { index, fileCount } = indexData;
  const queryTokens = tokenize(query);
  
  if (queryTokens.length === 0) return [];
  
  // Score: sum of TF-IDF-like scores per file
  // TF = freq in file, IDF = log(N / df) where df = docs containing term
  const fileScores = {};
  const fileLines = {};
  
  for (const token of queryTokens) {
    const postings = index[token];
    if (!postings) continue;
    
    const idf = Math.log((fileCount + 1) / (postings.length + 1)) + 1;
    
    for (const posting of postings) {
      const tf = 1 + Math.log(posting.freq); // log-normalized TF
      const score = tf * idf;
      
      if (!fileScores[posting.file]) {
        fileScores[posting.file] = 0;
        fileLines[posting.file] = posting.line;
      }
      fileScores[posting.file] += score;
      // Keep earliest relevant line
      if (posting.line < fileLines[posting.file]) {
        fileLines[posting.file] = posting.line;
      }
    }
  }
  
  // Sort by score descending
  const ranked = Object.entries(fileScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK);
  
  // Add context snippets
  const results = ranked.map(([file, score]) => {
    const absPath = path.join(WORKSPACE, file);
    let context = '';
    try {
      const content = fs.readFileSync(absPath, 'utf-8');
      const lines = content.split('\n');
      const lineIdx = fileLines[file] - 1;
      const start = Math.max(0, lineIdx - 1);
      const end = Math.min(lines.length, lineIdx + 3);
      context = lines.slice(start, end).join('\n').substring(0, 300);
    } catch (e) { /* no context */ }
    
    return {
      file,
      line: fileLines[file],
      score: Math.round(score * 100) / 100,
      context
    };
  });
  
  return results;
}

// --- Stats ---
function stats() {
  if (!fs.existsSync(INDEX_PATH)) {
    return { error: 'Index not built. Run: node skills/memory-index/index.js build' };
  }
  
  try {
    const raw = fs.readFileSync(INDEX_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return {
      files: data.fileCount,
      terms: data.termCount,
      postings: data.postingCount,
      sizeKB: Math.round(raw.length / 1024),
      lastBuild: data.builtAt,
      fingerprint: data.fingerprint?.substring(0, 8)
    };
  } catch (e) {
    return { error: `Failed to read index: ${e.message}` };
  }
}

// --- Exports ---
module.exports = { buildIndex, search, stats };

// --- CLI ---
if (require.main === module) {
  const cmd = process.argv[2];
  
  if (cmd === 'build') {
    const result = buildIndex();
    console.log(JSON.stringify(result, null, 2));
  } else if (cmd === 'search') {
    const query = process.argv.slice(3).join(' ');
    if (!query) {
      console.error('Usage: node index.js search <query>');
      process.exit(1);
    }
    const results = search(query);
    console.log(JSON.stringify(results, null, 2));
  } else if (cmd === 'stats') {
    console.log(JSON.stringify(stats(), null, 2));
  } else {
    console.error('Usage: node index.js <build|search|stats> [query]');
    process.exit(1);
  }
}
