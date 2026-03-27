#!/usr/bin/env node
'use strict';

/**
 * signal-correlator — Cross-reference signals from multiple intelligence
 * sources to identify correlated patterns and generate actionable alerts.
 *
 * No external dependencies — uses Node.js built-ins only.
 */

const fs = require('fs');
const path = require('path');

// ─── Config ─────────────────────────────────────────────
const MEMORY_DIR = path.resolve(__dirname, '..', '..', 'memory');
const SKILLS_DIR = path.resolve(__dirname, '..');
const FIRMS_DIR = path.join(SKILLS_DIR, 'firms-satellite');
const INTEL_DIR = path.join(SKILLS_DIR, 'intelligence');
const EVOLUTION_EVENTS = path.join(MEMORY_DIR, 'evolution', 'events.jsonl');
const SIGNAL_LOG = path.join(__dirname, 'signals.jsonl');

const DEFAULT_HOURS = 24;
const CORRELATION_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

// ─── Severity Levels ────────────────────────────────────
const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

// ─── Keyword Clusters (thematic matching) ───────────────
const THEME_CLUSTERS = {
  iran: ['iran', 'tehran', 'kharg', 'hormuz', 'khamenei', 'irgc', '伊朗', '霍尔木兹', '哈梅内伊'],
  crypto: ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', '比特币', '加密', 'defi'],
  cyber: ['cve', 'vulnerability', 'exploit', 'breach', 'malware', 'ransomware', '漏洞', '攻击', '安全'],
  ai: ['ai', 'llm', 'gpt', 'claude', 'gemini', 'model', '人工智能', '大模型', 'openai'],
  market: ['polymarket', 'market', 'trade', 'price', 'oil', '市场', '交易', '油价', 'stock'],
  military: ['strike', 'bomb', 'missile', 'fighter', 'navy', '打击', '导弹', '军事', '战斗机', 'military'],
};

// ─── Signal Extraction ──────────────────────────────────

/**
 * Extract signals from daily memory notes.
 */
function extractFromMemory(hours) {
  const cutoff = Date.now() - hours * 3600 * 1000;
  const signals = [];
  
  // Determine which date files to read
  const now = new Date();
  const dates = [];
  for (let d = 0; d <= Math.ceil(hours / 24) + 1; d++) {
    const dt = new Date(now.getTime() - d * 86400000);
    dates.push(dt.toISOString().slice(0, 10));
  }
  
  for (const dateStr of dates) {
    const filePath = path.join(MEMORY_DIR, `${dateStr}.md`);
    if (!fs.existsSync(filePath)) continue;
    
    const content = fs.readFileSync(filePath, 'utf8');
    const sections = content.split(/^##\s+/m).filter(Boolean);
    
    for (const section of sections) {
      const lines = section.split('\n');
      const title = lines[0]?.trim() || '';
      const body = lines.slice(1).join('\n').trim();
      
      // Detect severity from emoji/markers
      let severity = 'info';
      if (/🔴|CRITICAL|critical/i.test(title)) severity = 'critical';
      else if (/🟠|HIGH|high/i.test(title)) severity = 'high';
      else if (/🟡|MEDIUM|medium/i.test(title)) severity = 'medium';
      else if (/🟢|LOW|low/i.test(title)) severity = 'low';
      
      // Extract timestamps from section (look for HH:MM patterns)
      const timeMatch = title.match(/(\d{1,2}):(\d{2})/);
      let timestamp;
      if (timeMatch) {
        const dt = new Date(`${dateStr}T${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}:00+08:00`);
        timestamp = dt.getTime();
      } else {
        // Use file date at noon as fallback
        timestamp = new Date(`${dateStr}T12:00:00+08:00`).getTime();
      }
      
      if (timestamp < cutoff) continue;
      
      signals.push({
        source: 'memory',
        file: `memory/${dateStr}.md`,
        title: title.substring(0, 120),
        text: body.substring(0, 500),
        severity,
        timestamp,
        themes: detectThemes(title + ' ' + body),
      });
    }
  }
  
  return signals;
}

/**
 * Extract signals from FIRMS satellite JSON outputs.
 */
function extractFromFIRMS(hours) {
  const cutoff = Date.now() - hours * 3600 * 1000;
  const signals = [];
  
  if (!fs.existsSync(FIRMS_DIR)) return signals;
  
  const files = fs.readdirSync(FIRMS_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const filePath = path.join(FIRMS_DIR, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) continue;
      
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const items = Array.isArray(data) ? data : (data.fires || data.hotspots || [data]);
      
      for (const item of items.slice(0, 20)) { // Cap at 20 per file
        const lat = item.latitude || item.lat;
        const lon = item.longitude || item.lon;
        const frp = item.frp || item.brightness || 0;
        
        if (!lat || !lon) continue;
        
        signals.push({
          source: 'firms',
          file: `firms-satellite/${file}`,
          title: `Fire detected: ${lat?.toFixed(2)},${lon?.toFixed(2)} FRP=${frp}`,
          text: JSON.stringify(item).substring(0, 300),
          severity: frp > 100 ? 'high' : frp > 50 ? 'medium' : 'low',
          timestamp: item.acq_time ? new Date(item.acq_time).getTime() : stat.mtimeMs,
          themes: detectThemes(`fire ${lat} ${lon} ${item.country || ''}`),
          geo: { lat, lon },
        });
      }
    } catch (e) { /* skip malformed */ }
  }
  
  return signals;
}

/**
 * Extract signals from intelligence JSON outputs.
 */
function extractFromIntel(hours) {
  const cutoff = Date.now() - hours * 3600 * 1000;
  const signals = [];
  
  if (!fs.existsSync(INTEL_DIR)) return signals;
  
  const jsonFiles = fs.readdirSync(INTEL_DIR).filter(f => f.endsWith('.json'));
  for (const file of jsonFiles.slice(-30)) { // Last 30 files
    try {
      const filePath = path.join(INTEL_DIR, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) continue;
      
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const summary = data.summary || data.title || data.status || file;
      
      signals.push({
        source: 'intelligence',
        file: `intelligence/${file}`,
        title: String(summary).substring(0, 120),
        text: JSON.stringify(data).substring(0, 500),
        severity: data.severity || 'info',
        timestamp: data.timestamp ? new Date(data.timestamp).getTime() : stat.mtimeMs,
        themes: detectThemes(JSON.stringify(data).substring(0, 1000)),
      });
    } catch (e) { /* skip malformed */ }
  }
  
  return signals;
}

/**
 * Extract signals from manual signal log.
 */
function extractFromLog(hours) {
  const cutoff = Date.now() - hours * 3600 * 1000;
  const signals = [];
  
  if (!fs.existsSync(SIGNAL_LOG)) return signals;
  
  const lines = fs.readFileSync(SIGNAL_LOG, 'utf8').trim().split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const sig = JSON.parse(line);
      if (sig.timestamp && sig.timestamp < cutoff) continue;
      signals.push({
        ...sig,
        themes: sig.themes || detectThemes(sig.text || sig.title || ''),
      });
    } catch (e) { /* skip */ }
  }
  
  return signals;
}

// ─── Theme Detection ────────────────────────────────────

function detectThemes(text) {
  const lower = text.toLowerCase();
  const matched = [];
  for (const [theme, keywords] of Object.entries(THEME_CLUSTERS)) {
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        matched.push(theme);
        break;
      }
    }
  }
  return matched;
}

// ─── Correlation Engine ─────────────────────────────────

/**
 * Group signals into correlation clusters.
 * Two signals correlate if they share themes AND are within the time window.
 */
function buildCorrelations(signals, windowMs) {
  const clusters = [];
  const assigned = new Set();
  
  // Sort by timestamp
  signals.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  
  for (let i = 0; i < signals.length; i++) {
    if (assigned.has(i)) continue;
    
    const cluster = { signals: [signals[i]], themes: new Set(signals[i].themes || []) };
    assigned.add(i);
    
    for (let j = i + 1; j < signals.length; j++) {
      if (assigned.has(j)) continue;
      
      const timeDiff = Math.abs((signals[j].timestamp || 0) - (signals[i].timestamp || 0));
      if (timeDiff > windowMs) continue;
      
      // Check theme overlap
      const sharedThemes = (signals[j].themes || []).filter(t => cluster.themes.has(t));
      if (sharedThemes.length === 0) continue;
      
      // Must come from different sources for meaningful correlation
      const existingSources = new Set(cluster.signals.map(s => s.source));
      if (!existingSources.has(signals[j].source) || existingSources.size === 1) {
        cluster.signals.push(signals[j]);
        for (const t of signals[j].themes || []) cluster.themes.add(t);
        assigned.add(j);
      }
    }
    
    clusters.push(cluster);
  }
  
  return clusters;
}

/**
 * Score and format correlation clusters.
 */
function scoreCorrelations(clusters) {
  return clusters
    .map(cluster => {
      const sources = new Set(cluster.signals.map(s => s.source));
      const sourceCount = sources.size;
      
      // Multi-source correlations are more significant
      const correlationScore = Math.min(1, (sourceCount - 1) * 0.3 + 0.1);
      
      // Aggregate severity (highest wins, boosted by multi-source)
      const maxSeverity = cluster.signals.reduce((max, s) => {
        return (SEVERITY_RANK[s.severity] || 0) > (SEVERITY_RANK[max] || 0) ? s.severity : max;
      }, 'info');
      
      // Boost severity if multi-source
      let effectiveSeverity = maxSeverity;
      if (sourceCount >= 3 && SEVERITY_RANK[maxSeverity] < 4) {
        const idx = Object.entries(SEVERITY_RANK).find(([k, v]) => v === (SEVERITY_RANK[maxSeverity] || 0) + 1);
        if (idx) effectiveSeverity = idx[0];
      }
      
      return {
        id: `corr_${cluster.signals[0]?.timestamp || Date.now()}`,
        themes: [...cluster.themes],
        sources: [...sources],
        signal_count: cluster.signals.length,
        correlation_score: parseFloat(correlationScore.toFixed(2)),
        severity: effectiveSeverity,
        max_raw_severity: maxSeverity,
        time_range: {
          start: new Date(Math.min(...cluster.signals.map(s => s.timestamp || 0))).toISOString(),
          end: new Date(Math.max(...cluster.signals.map(s => s.timestamp || 0))).toISOString(),
        },
        signals: cluster.signals.map(s => ({
          source: s.source,
          title: s.title,
          severity: s.severity,
          timestamp: s.timestamp ? new Date(s.timestamp).toISOString() : null,
        })),
      };
    })
    .filter(c => c.signal_count > 1 || SEVERITY_RANK[c.severity] >= 3) // Keep multi-signal or high-severity
    .sort((a, b) => b.correlation_score - a.correlation_score || SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

// ─── Public API ─────────────────────────────────────────

/**
 * Correlate signals from all sources.
 * @param {Object} options
 * @param {number} options.hours - Time window in hours (default: 24)
 * @param {string} options.topic - Filter by theme keyword
 * @returns {Array} Scored correlation clusters
 */
function correlate(options = {}) {
  const hours = options.hours || DEFAULT_HOURS;
  const topic = options.topic?.toLowerCase();
  
  // Gather signals from all sources
  let signals = [
    ...extractFromMemory(hours),
    ...extractFromFIRMS(hours),
    ...extractFromIntel(hours),
    ...extractFromLog(hours),
  ];
  
  // Filter by topic if specified
  if (topic) {
    signals = signals.filter(s =>
      (s.themes || []).some(t => t.includes(topic)) ||
      (s.title || '').toLowerCase().includes(topic) ||
      (s.text || '').toLowerCase().includes(topic)
    );
  }
  
  // Build and score correlations
  const clusters = buildCorrelations(signals, CORRELATION_WINDOW_MS);
  return scoreCorrelations(clusters);
}

/**
 * Ingest a manual signal.
 */
function ingest(signal) {
  const entry = {
    source: signal.source || 'manual',
    title: signal.title || signal.text?.substring(0, 80) || 'manual signal',
    text: signal.text || '',
    severity: signal.severity || 'medium',
    timestamp: signal.timestamp || Date.now(),
    themes: signal.themes || detectThemes(signal.text || signal.title || ''),
  };
  
  fs.appendFileSync(SIGNAL_LOG, JSON.stringify(entry) + '\n');
  return entry;
}

/**
 * List available signal sources and their status.
 */
function getSources() {
  const sources = [
    { name: 'memory', path: MEMORY_DIR, available: fs.existsSync(MEMORY_DIR) },
    { name: 'firms', path: FIRMS_DIR, available: fs.existsSync(FIRMS_DIR) },
    { name: 'intelligence', path: INTEL_DIR, available: fs.existsSync(INTEL_DIR) },
    { name: 'signal_log', path: SIGNAL_LOG, available: fs.existsSync(SIGNAL_LOG) },
  ];
  
  for (const src of sources) {
    if (src.available) {
      try {
        if (fs.statSync(src.path).isDirectory()) {
          src.file_count = fs.readdirSync(src.path).length;
        } else {
          src.file_count = 1;
        }
      } catch (e) { src.file_count = 0; }
    }
  }
  
  return sources;
}

// ─── CLI ────────────────────────────────────────────────

function formatMarkdown(clusters) {
  if (clusters.length === 0) return '✅ No significant correlations detected in the time window.\n';
  
  const lines = ['# 🔗 Signal Correlation Report\n'];
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Clusters found: ${clusters.length}\n`);
  
  for (const c of clusters) {
    const severityEmoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢', info: '⚪' }[c.severity] || '⚪';
    lines.push(`## ${severityEmoji} [${c.severity.toUpperCase()}] ${c.themes.join(', ')} (${c.signal_count} signals, ${c.sources.length} sources)`);
    lines.push(`Score: ${c.correlation_score} | Sources: ${c.sources.join(', ')}`);
    lines.push(`Time: ${c.time_range.start} — ${c.time_range.end}\n`);
    
    for (const sig of c.signals) {
      lines.push(`- **[${sig.source}]** ${sig.title}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'correlate';
  
  // Parse options
  const opts = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--hours' && args[i + 1]) { opts.hours = parseInt(args[++i]); }
    else if (args[i] === '--topic' && args[i + 1]) { opts.topic = args[++i]; }
    else if (args[i] === '--json') { opts.json = true; }
    else if (args[i] === '--source' && args[i + 1]) { opts.source = args[++i]; }
    else if (args[i] === '--text' && args[i + 1]) { opts.text = args[++i]; }
    else if (args[i] === '--severity' && args[i + 1]) { opts.severity = args[++i]; }
  }
  
  switch (command) {
    case 'correlate': {
      const clusters = correlate(opts);
      if (opts.json) {
        console.log(JSON.stringify(clusters, null, 2));
      } else {
        console.log(formatMarkdown(clusters));
      }
      break;
    }
    case 'sources': {
      const sources = getSources();
      if (opts.json) {
        console.log(JSON.stringify(sources, null, 2));
      } else {
        console.log('Signal Sources:');
        for (const s of sources) {
          console.log(`  ${s.available ? '✅' : '❌'} ${s.name}: ${s.path} (${s.file_count || 0} files)`);
        }
      }
      break;
    }
    case 'ingest': {
      if (!opts.text) {
        console.error('Usage: node index.js ingest --text "signal text" [--source name] [--severity level]');
        process.exit(1);
      }
      const entry = ingest(opts);
      console.log('Ingested:', JSON.stringify(entry, null, 2));
      break;
    }
    default:
      console.error(`Unknown command: ${command}. Use: correlate, sources, ingest`);
      process.exit(1);
  }
}

// ─── Exports ────────────────────────────────────────────

module.exports = { correlate, ingest, getSources, main };

if (require.main === module) {
  main();
}
