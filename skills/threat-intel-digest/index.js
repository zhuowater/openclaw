/**
 * threat-intel-digest — Parse MEMORY.md insights, generate threat intelligence briefings
 * 
 * Exports:
 *   parseInsights(memoryPath)     — Extract structured insights from MEMORY.md
 *   generateBriefing(options)     — Full threat intel briefing with optional live data
 *   analyzeTrends(options)        — Compare current vs historical insight landscape
 *   categorizeThreat(text)        — Auto-categorize a threat description
 *   main()                        — CLI entry point
 */

const fs = require('fs');
const path = require('path');

// ─── Insight Categories ───
const CATEGORIES = {
  'ai-attack': {
    label: 'AI-Native Attacks',
    keywords: ['attack', 'exploit', 'malware', 'vulnerability', 'CVE', 'zero-day', 'weaponize', 'HONESTCUE', 'React2Shell', 'infostealer'],
    severity_weight: 1.0
  },
  'ai-ecosystem': {
    label: 'AI Ecosystem Security',
    keywords: ['MCP', 'A2A', 'prompt injection', 'agent', 'sandbox', 'escape', 'LLM', 'OWASP'],
    severity_weight: 0.95
  },
  'supply-chain': {
    label: 'Supply Chain',
    keywords: ['supply chain', 'npm', 'CI/CD', 'pipeline', 'dependency', 'Cline', 'ClawHub', 'distill'],
    severity_weight: 0.9
  },
  'infrastructure': {
    label: 'Infrastructure Vulnerabilities',
    keywords: ['infrastructure', 'dyld', 'legacy', 'patch', 'CVSS', 'BeyondTrust', 'Cisco', 'Fortinet'],
    severity_weight: 0.85
  },
  'geopolitical': {
    label: 'Geopolitical Cyber Threats',
    keywords: ['geopolitical', 'nation-state', 'Russia', 'Iran', 'China', 'military', 'conflict', 'sanctions'],
    severity_weight: 0.7
  },
  'industry': {
    label: 'AI Industry Dynamics',
    keywords: ['distillation', 'IP', 'intellectual property', 'OpenAI', 'DeepSeek', 'commercial', 'crypto', 'bitcoin'],
    severity_weight: 0.6
  }
};

// ─── Parse Insights from MEMORY.md ───
function parseInsights(memoryPath) {
  const resolvedPath = path.resolve(memoryPath || path.join(__dirname, '../../MEMORY.md'));
  
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`MEMORY.md not found at: ${resolvedPath}`);
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const insights = [];

  // Match insight blocks: **洞见 #N: Title** ⭐... \n Description
  const insightRegex = /\*\*洞见 #(\d+):\s*(.+?)\*\*\s*(⭐+)\n([\s\S]*?)(?=\*\*洞见 #|\n### |\n## |\n---|\Z)/g;
  let match;

  while ((match = insightRegex.exec(content)) !== null) {
    const id = parseInt(match[1], 10);
    const title = match[2].trim();
    const stars = match[3].length;
    const body = match[4].trim();

    // Extract date if present (YYYY-MM-DD)
    const dateMatch = body.match(/\((\d{4}-\d{2}-\d{2})\)/);
    const date = dateMatch ? dateMatch[1] : null;

    // Auto-categorize
    const category = categorizeThreat(title + ' ' + body);

    // Extract key entities (CVEs, tools, actors)
    const cves = [...new Set((body.match(/CVE-\d{4}-\d{4,}/g) || []))];
    const cvssScores = [...new Set((body.match(/CVSS\s*[\d.]+/gi) || []).map(s => parseFloat(s.replace(/CVSS\s*/i, ''))))];

    insights.push({
      id,
      title,
      importance: stars,
      category,
      date,
      body: body.substring(0, 500), // Truncate for structured output
      cves,
      cvssScores,
      // Computed severity: stars * category weight
      severity: Math.round(stars * (CATEGORIES[category]?.severity_weight || 0.5) * 20) / 10
    });
  }

  return insights.sort((a, b) => b.severity - a.severity);
}

// ─── Auto-categorize threat text ───
function categorizeThreat(text) {
  const lowerText = text.toLowerCase();
  let bestCategory = 'ai-attack'; // default
  let bestScore = 0;

  for (const [catId, cat] of Object.entries(CATEGORIES)) {
    let score = 0;
    for (const kw of cat.keywords) {
      if (lowerText.includes(kw.toLowerCase())) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = catId;
    }
  }

  return bestCategory;
}

// ─── Generate Briefing ───
async function generateBriefing(options = {}) {
  const {
    memoryPath = path.join(__dirname, '../../MEMORY.md'),
    outputPath = path.join(__dirname, '../../memory/threat-reports'),
    format = 'markdown'
  } = options;

  const insights = parseInsights(memoryPath);
  
  if (insights.length === 0) {
    return { error: 'No insights found in MEMORY.md' };
  }

  // Build category summary
  const categoryMap = {};
  for (const insight of insights) {
    if (!categoryMap[insight.category]) {
      categoryMap[insight.category] = [];
    }
    categoryMap[insight.category].push(insight);
  }

  // Compute overall risk level
  const avgSeverity = insights.reduce((sum, i) => sum + i.severity, 0) / insights.length;
  const riskLevel = avgSeverity >= 4.5 ? 'CRITICAL' : avgSeverity >= 3.5 ? 'HIGH' : avgSeverity >= 2.5 ? 'ELEVATED' : 'MODERATE';

  // Top threats
  const topThreats = insights.slice(0, 5);

  // All CVEs
  const allCVEs = [...new Set(insights.flatMap(i => i.cves))];

  // Build trend indicators
  const trendData = {};
  for (const [catId, catInsights] of Object.entries(categoryMap)) {
    const dated = catInsights.filter(i => i.date);
    const recent = dated.filter(i => {
      const d = new Date(i.date);
      const now = new Date();
      return (now - d) < 7 * 24 * 60 * 60 * 1000; // last 7 days
    });
    trendData[catId] = {
      total: catInsights.length,
      recent: recent.length,
      trend: recent.length > 0 ? '↑ Active' : '→ Stable',
      avgImportance: Math.round(catInsights.reduce((s, i) => s + i.importance, 0) / catInsights.length * 10) / 10
    };
  }

  const briefing = {
    generated_at: new Date().toISOString(),
    risk_level: riskLevel,
    avg_severity: Math.round(avgSeverity * 10) / 10,
    total_insights: insights.length,
    total_cves: allCVEs.length,
    cves: allCVEs,
    top_threats: topThreats.map(t => ({
      id: `#${t.id}`,
      title: t.title,
      category: t.category,
      severity: t.severity,
      importance: '⭐'.repeat(t.importance)
    })),
    categories: Object.entries(categoryMap).map(([catId, items]) => ({
      id: catId,
      label: CATEGORIES[catId]?.label || catId,
      count: items.length,
      trend: trendData[catId]?.trend || '→',
      avg_importance: trendData[catId]?.avgImportance || 0
    })),
    trend_summary: trendData
  };

  // Generate markdown report
  if (format === 'markdown') {
    const md = formatMarkdownBriefing(briefing, insights, categoryMap);
    
    // Ensure output directory exists
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    const dateStr = new Date().toISOString().split('T')[0];
    const reportFile = path.join(outputPath, `threat-briefing-${dateStr}.md`);
    fs.writeFileSync(reportFile, md, 'utf-8');
    briefing.report_file = reportFile;
  }

  return briefing;
}

// ─── Format Markdown Briefing ───
function formatMarkdownBriefing(briefing, insights, categoryMap) {
  const lines = [];
  
  lines.push(`# 🔒 Threat Intelligence Briefing`);
  lines.push(`**Generated:** ${briefing.generated_at}`);
  lines.push(`**Risk Level:** ${briefing.risk_level} | **Insights:** ${briefing.total_insights} | **CVEs Tracked:** ${briefing.total_cves}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Executive Summary
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`Overall threat landscape assessment: **${briefing.risk_level}** (avg severity: ${briefing.avg_severity}/5.0)`);
  lines.push('');
  lines.push('### Top Threats');
  for (const t of briefing.top_threats) {
    lines.push(`- ${t.importance} **${t.id} ${t.title}** — *${CATEGORIES[t.category]?.label || t.category}* (severity: ${t.severity})`);
  }
  lines.push('');

  // Category Breakdown
  lines.push('## Threat Categories');
  lines.push('');
  for (const cat of briefing.categories) {
    lines.push(`### ${cat.label} (${cat.count} insights, trend: ${cat.trend})`);
    const items = categoryMap[cat.id] || [];
    for (const item of items) {
      lines.push(`- **#${item.id}:** ${item.title} ${'⭐'.repeat(item.importance)}`);
      if (item.cves.length > 0) {
        lines.push(`  - CVEs: ${item.cves.join(', ')}`);
      }
    }
    lines.push('');
  }

  // CVE Tracker
  if (briefing.cves.length > 0) {
    lines.push('## CVE Tracker');
    lines.push('');
    for (const cve of briefing.cves) {
      const relatedInsights = insights.filter(i => i.cves.includes(cve));
      lines.push(`- **${cve}** — Referenced in: ${relatedInsights.map(i => `#${i.id}`).join(', ')}`);
    }
    lines.push('');
  }

  // Trend Analysis
  lines.push('## Trend Analysis');
  lines.push('');
  for (const [catId, trend] of Object.entries(briefing.trend_summary)) {
    lines.push(`- **${CATEGORIES[catId]?.label || catId}**: ${trend.trend} (${trend.total} total, ${trend.recent} recent, avg importance: ${trend.avgImportance}⭐)`);
  }
  lines.push('');

  // Action Items
  lines.push('## Recommended Actions');
  lines.push('');
  const critical = insights.filter(i => i.severity >= 4.5);
  if (critical.length > 0) {
    lines.push('### 🔴 Immediate');
    for (const c of critical) {
      lines.push(`- Review and act on **#${c.id}: ${c.title}**`);
    }
  }
  const high = insights.filter(i => i.severity >= 3.5 && i.severity < 4.5);
  if (high.length > 0) {
    lines.push('### 🟡 Short-term');
    for (const h of high) {
      lines.push(`- Monitor developments on **#${h.id}: ${h.title}**`);
    }
  }
  lines.push('');
  lines.push('---');
  lines.push(`*Report generated by threat-intel-digest v1.0.0*`);

  return lines.join('\n');
}

// ─── Trend Analysis ───
async function analyzeTrends(options = {}) {
  const {
    memoryPath = path.join(__dirname, '../../MEMORY.md'),
    previousReports = path.join(__dirname, '../../memory/threat-reports')
  } = options;

  const currentInsights = parseInsights(memoryPath);
  
  // Load previous reports for comparison
  const previousFiles = [];
  if (fs.existsSync(previousReports)) {
    const files = fs.readdirSync(previousReports)
      .filter(f => f.startsWith('threat-briefing-') && f.endsWith('.md'))
      .sort()
      .reverse();
    
    if (files.length > 0) {
      previousFiles.push(...files.slice(0, 5));
    }
  }

  // Category evolution
  const categoryTrend = {};
  for (const [catId, cat] of Object.entries(CATEGORIES)) {
    const catInsights = currentInsights.filter(i => i.category === catId);
    categoryTrend[catId] = {
      label: cat.label,
      current_count: catInsights.length,
      max_severity: catInsights.length > 0 ? Math.max(...catInsights.map(i => i.severity)) : 0,
      avg_severity: catInsights.length > 0 ? Math.round(catInsights.reduce((s, i) => s + i.severity, 0) / catInsights.length * 10) / 10 : 0
    };
  }

  return {
    analyzed_at: new Date().toISOString(),
    total_insights: currentInsights.length,
    previous_reports_found: previousFiles.length,
    category_trend: categoryTrend,
    newest_insight: currentInsights.length > 0 ? {
      id: currentInsights[0].id,
      title: currentInsights[0].title,
      date: currentInsights[0].date
    } : null,
    emerging_themes: detectEmergingThemes(currentInsights)
  };
}

// ─── Detect emerging themes ───
function detectEmergingThemes(insights) {
  const themes = [];
  
  // Count keyword frequency
  const keywordFreq = {};
  for (const insight of insights) {
    const words = (insight.title + ' ' + insight.body).toLowerCase().split(/\s+/);
    for (const w of words) {
      if (w.length > 3) {
        keywordFreq[w] = (keywordFreq[w] || 0) + 1;
      }
    }
  }

  // Find high-frequency terms (appearing in 3+ insights)
  const hotTerms = Object.entries(keywordFreq)
    .filter(([_, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term, count]) => ({ term, frequency: count }));

  if (hotTerms.length > 0) {
    themes.push({
      type: 'hot_keywords',
      description: 'Frequently occurring terms across insights',
      items: hotTerms
    });
  }

  // Detect CVE clusters
  const allCVEs = insights.flatMap(i => i.cves);
  if (allCVEs.length >= 3) {
    themes.push({
      type: 'cve_cluster',
      description: `${allCVEs.length} CVEs tracked across insights`,
      items: [...new Set(allCVEs)]
    });
  }

  // Detect 5-star concentration
  const fiveStar = insights.filter(i => i.importance === 5);
  if (fiveStar.length >= 3) {
    themes.push({
      type: 'critical_concentration',
      description: `${fiveStar.length} critical (5⭐) insights — high threat density`,
      categories: [...new Set(fiveStar.map(i => i.category))]
    });
  }

  return themes;
}

// ─── CLI Entry Point ───
async function main(args) {
  const command = args?.[0] || process.argv[2] || 'briefing';
  
  switch (command) {
    case 'parse': {
      const insights = parseInsights();
      console.log(JSON.stringify(insights, null, 2));
      return insights;
    }
    case 'briefing': {
      const result = await generateBriefing();
      console.log(`✅ Briefing generated: ${result.report_file || 'N/A'}`);
      console.log(`   Risk Level: ${result.risk_level}`);
      console.log(`   Insights: ${result.total_insights}`);
      console.log(`   CVEs: ${result.total_cves}`);
      console.log(`   Top threats:`);
      for (const t of (result.top_threats || [])) {
        console.log(`   - ${t.importance} ${t.id} ${t.title}`);
      }
      return result;
    }
    case 'landscape': {
      const trends = await analyzeTrends();
      console.log(JSON.stringify(trends, null, 2));
      return trends;
    }
    default:
      console.log('Usage: node index.js [parse|briefing|landscape]');
      return null;
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = {
  parseInsights,
  generateBriefing,
  analyzeTrends,
  categorizeThreat,
  main
};
