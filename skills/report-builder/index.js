#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// ── Templates ──

const TEMPLATES = {
  'daily-intel': {
    name: 'Daily Intelligence Brief',
    sections: ['executive-summary', 'cybersecurity', 'geopolitics', 'technology', 'markets', 'action-items'],
    metadata: { classification: 'INTERNAL', type: 'intelligence' }
  },
  'weekly-review': {
    name: 'Weekly Review',
    sections: ['executive-summary', 'achievements', 'issues-risks', 'metrics', 'next-week-plan'],
    metadata: { classification: 'INTERNAL', type: 'review' }
  },
  'incident': {
    name: 'Incident Report',
    sections: ['incident-summary', 'timeline', 'impact-assessment', 'root-cause', 'remediation', 'lessons-learned'],
    metadata: { classification: 'CONFIDENTIAL', type: 'incident' }
  },
  'research': {
    name: 'Research Report',
    sections: ['abstract', 'background', 'methodology', 'findings', 'analysis', 'conclusion', 'references'],
    metadata: { classification: 'INTERNAL', type: 'research' }
  },
  'blank': {
    name: 'Blank Report',
    sections: [],
    metadata: { classification: 'INTERNAL', type: 'custom' }
  }
};

const SECTION_LABELS = {
  'executive-summary': '📋 Executive Summary',
  'cybersecurity': '🔒 Cybersecurity',
  'geopolitics': '🌍 Geopolitics',
  'technology': '💡 Technology',
  'markets': '📈 Markets',
  'action-items': '✅ Action Items',
  'achievements': '🏆 Achievements',
  'issues-risks': '⚠️ Issues & Risks',
  'metrics': '📊 Metrics',
  'next-week-plan': '📅 Next Week Plan',
  'incident-summary': '🚨 Incident Summary',
  'timeline': '⏱️ Timeline',
  'impact-assessment': '💥 Impact Assessment',
  'root-cause': '🔍 Root Cause Analysis',
  'remediation': '🛠️ Remediation',
  'lessons-learned': '📝 Lessons Learned',
  'abstract': '📄 Abstract',
  'background': '📚 Background',
  'methodology': '🔬 Methodology',
  'findings': '🔎 Findings',
  'analysis': '📊 Analysis',
  'conclusion': '🎯 Conclusion',
  'references': '📎 References',
  'summary': '📋 Summary'
};

// ── Core Functions ──

function createReport(options = {}) {
  const {
    template = 'blank',
    title = 'Untitled Report',
    author = '奇安信机器人',
    date = new Date().toISOString().split('T')[0],
    sections = null,
    metadata = {}
  } = options;

  const tmpl = TEMPLATES[template] || TEMPLATES.blank;
  const sectionList = sections
    ? (Array.isArray(sections) ? sections : sections.split(',').map(s => s.trim()))
    : tmpl.sections;

  const report = {
    title,
    author,
    date,
    created_at: new Date().toISOString(),
    template: template,
    metadata: { ...tmpl.metadata, ...metadata },
    sections: sectionList.map(name => ({
      id: name,
      label: SECTION_LABELS[name] || formatLabel(name),
      content: '',
      priority: null,
      status: null
    }))
  };

  return report;
}

function formatLabel(name) {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function addSection(report, { name, content = '', level = 2, priority = null, position = -1 }) {
  const section = {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    label: SECTION_LABELS[name] || formatLabel(name),
    content,
    priority,
    status: null
  };

  if (position >= 0 && position < report.sections.length) {
    report.sections.splice(position, 0, section);
  } else {
    report.sections.push(section);
  }

  return report;
}

function updateSection(report, sectionId, content, options = {}) {
  const section = report.sections.find(s => s.id === sectionId);
  if (!section) {
    throw new Error(`Section "${sectionId}" not found. Available: ${report.sections.map(s => s.id).join(', ')}`);
  }
  section.content = content;
  if (options.priority) section.priority = options.priority;
  if (options.status) section.status = options.status;
  return report;
}

function generateTOC(report) {
  const lines = ['## Table of Contents', ''];
  report.sections.forEach((section, i) => {
    const prefix = section.priority ? `[${section.priority}] ` : '';
    const status = section.status ? ` ${section.status}` : '';
    const anchor = section.id.toLowerCase().replace(/\s+/g, '-');
    lines.push(`${i + 1}. [${prefix}${section.label}${status}](#${anchor})`);
  });
  lines.push('');
  return lines.join('\n');
}

function renderReport(report, options = {}) {
  const { includeTOC = true, includeMetadata = true } = options;
  const lines = [];

  // Header
  lines.push(`# ${report.title}`);
  lines.push('');

  // Metadata block
  if (includeMetadata) {
    lines.push('> **Report Metadata**');
    lines.push(`> - Author: ${report.author}`);
    lines.push(`> - Date: ${report.date}`);
    lines.push(`> - Template: ${report.template}`);
    if (report.metadata.classification) {
      lines.push(`> - Classification: ${report.metadata.classification}`);
    }
    if (report.metadata.type) {
      lines.push(`> - Type: ${report.metadata.type}`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // TOC
  if (includeTOC && report.sections.length > 0) {
    lines.push(generateTOC(report));
    lines.push('---');
    lines.push('');
  }

  // Sections
  report.sections.forEach(section => {
    lines.push(`## ${section.label}`);
    lines.push('');
    if (section.content) {
      lines.push(section.content);
    } else {
      lines.push('*No content yet.*');
    }
    lines.push('');
  });

  // Footer
  lines.push('---');
  lines.push(`*Generated by report-builder on ${new Date().toISOString()}*`);

  return lines.join('\n');
}

function exportReport(report, options = {}) {
  const { format = 'markdown', output = null, includeTOC = true } = options;

  let content;
  if (format === 'markdown' || format === 'md') {
    content = renderReport(report, { includeTOC });
  } else if (format === 'json') {
    content = JSON.stringify(report, null, 2);
  } else {
    throw new Error(`Unsupported format: ${format}. Use 'markdown' or 'json'.`);
  }

  if (output) {
    const dir = path.dirname(output);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(output, content, 'utf-8');
    return { written: output, bytes: Buffer.byteLength(content) };
  }

  return content;
}

function listTemplates() {
  return Object.entries(TEMPLATES).map(([id, t]) => ({
    id,
    name: t.name,
    sections: t.sections,
    metadata: t.metadata
  }));
}

function parseReportFile(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const report = {
    title: '',
    author: '',
    date: '',
    metadata: {},
    sections: []
  };

  let currentSection = null;
  let sectionContent = [];

  for (const line of lines) {
    // Title
    if (line.startsWith('# ') && !report.title) {
      report.title = line.slice(2).trim();
      continue;
    }
    // Metadata
    if (line.startsWith('> - Author:')) report.author = line.split(':').slice(1).join(':').trim();
    if (line.startsWith('> - Date:')) report.date = line.split(':').slice(1).join(':').trim();

    // Section header
    if (line.startsWith('## ') && !line.startsWith('## Table of Contents')) {
      if (currentSection) {
        currentSection.content = sectionContent.join('\n').trim();
        report.sections.push(currentSection);
        sectionContent = [];
      }
      const label = line.slice(3).trim();
      currentSection = {
        id: label.replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/\s+/g, '-'),
        label,
        content: '',
        priority: null,
        status: null
      };
      continue;
    }

    if (currentSection) {
      sectionContent.push(line);
    }
  }

  // Flush last section
  if (currentSection) {
    currentSection.content = sectionContent.join('\n').trim();
    report.sections.push(currentSection);
  }

  return report;
}

// ── CLI ──

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`report-builder — Build structured reports from templates

Commands:
  create     Create a new report from template
  templates  List available templates
  add-section  Add a section to an existing report
  toc        Generate table of contents
  export     Export report with formatting

Options for 'create':
  --template <name>   Template: daily-intel, weekly-review, incident, research, blank
  --title <string>    Report title
  --author <string>   Author name (default: 奇安信机器人)
  --sections <list>   Comma-separated section names (overrides template)
  --output <path>     Write to file instead of stdout

Options for 'add-section':
  --report <path>     Path to existing report markdown
  --name <string>     Section name
  --content <string>  Section content

Options for 'toc':
  --report <path>     Path to report markdown

Options for 'export':
  --report <path>     Path to report to export
  --format <fmt>      Output format: markdown, json
  --output <path>     Write to file
`);
    return;
  }

  const flags = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      flags[key] = args[i + 1] || true;
      i++;
    }
  }

  switch (command) {
    case 'create': {
      const report = createReport({
        template: flags.template || 'blank',
        title: flags.title || `Report - ${new Date().toISOString().split('T')[0]}`,
        author: flags.author,
        sections: flags.sections ? flags.sections.split(',').map(s => s.trim()) : undefined
      });

      const rendered = renderReport(report);

      if (flags.output) {
        const dir = path.dirname(flags.output);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(flags.output, rendered, 'utf-8');
        console.log(`✅ Report written to ${flags.output} (${Buffer.byteLength(rendered)} bytes)`);
      } else {
        console.log(rendered);
      }
      break;
    }

    case 'templates': {
      const templates = listTemplates();
      console.log('Available Templates:\n');
      for (const t of templates) {
        console.log(`  ${t.id}`);
        console.log(`    Name: ${t.name}`);
        console.log(`    Sections: ${t.sections.join(', ') || '(custom)'}`);
        console.log(`    Type: ${t.metadata.type}`);
        console.log('');
      }
      break;
    }

    case 'add-section': {
      if (!flags.report) { console.error('Error: --report is required'); process.exit(1); }
      const report = parseReportFile(flags.report);
      addSection(report, {
        name: flags.name || 'New Section',
        content: flags.content || ''
      });
      const rendered = renderReport(report);
      fs.writeFileSync(flags.report, rendered, 'utf-8');
      console.log(`✅ Section "${flags.name}" added to ${flags.report}`);
      break;
    }

    case 'toc': {
      if (!flags.report) { console.error('Error: --report is required'); process.exit(1); }
      const report = parseReportFile(flags.report);
      console.log(generateTOC(report));
      break;
    }

    case 'export': {
      if (!flags.report) { console.error('Error: --report is required'); process.exit(1); }
      const report = parseReportFile(flags.report);
      const result = exportReport(report, {
        format: flags.format || 'markdown',
        output: flags.output
      });
      if (typeof result === 'string') {
        console.log(result);
      } else {
        console.log(`✅ Exported to ${result.written} (${result.bytes} bytes)`);
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}. Run with --help for usage.`);
      process.exit(1);
  }
}

// ── Exports ──

module.exports = {
  createReport,
  addSection,
  updateSection,
  generateTOC,
  renderReport,
  exportReport,
  listTemplates,
  parseReportFile,
  TEMPLATES,
  SECTION_LABELS
};

if (require.main === module) main();
