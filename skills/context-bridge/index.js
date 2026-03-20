/**
 * context-bridge — Generate compressed context summaries for sub-agent onboarding
 *
 * Reduces 5-8 separate exec/read calls into a single invocation.
 * Outputs markdown or JSON context packages.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || '/root/openclaw';

// ── Section Generators ────────────────────────────────────

async function sectionMemory() {
  const items = {};

  // MEMORY.md summary
  const memPath = path.join(WORKSPACE, 'MEMORY.md');
  if (fs.existsSync(memPath)) {
    const content = fs.readFileSync(memPath, 'utf8');
    // Extract active status section
    const activeMatch = content.match(/## 当前活跃状态[\s\S]*?(?=\n## |$)/);
    items.activeState = activeMatch ? activeMatch[0].trim() : '(none)';

    // Extract TODOs
    const todos = content.match(/- \[ \].+/g);
    items.pendingTodos = todos || [];
  }

  // Today's memory notes
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  for (const date of [today, yesterday]) {
    const notePath = path.join(WORKSPACE, 'memory', `${date}.md`);
    if (fs.existsSync(notePath)) {
      const content = fs.readFileSync(notePath, 'utf8');
      // Get last 500 chars as recent context
      items[`notes_${date}`] = content.length > 500
        ? '...' + content.slice(-500)
        : content;
    }
  }

  return items;
}

async function sectionTasks() {
  const items = {};

  // Check heartbeat state
  const hbPath = path.join(WORKSPACE, 'memory', 'heartbeat-state.json');
  if (fs.existsSync(hbPath)) {
    try {
      items.heartbeat = JSON.parse(fs.readFileSync(hbPath, 'utf8'));
    } catch { items.heartbeat = '(parse error)'; }
  }

  // HEARTBEAT.md summary
  const hbMdPath = path.join(WORKSPACE, 'HEARTBEAT.md');
  if (fs.existsSync(hbMdPath)) {
    const content = fs.readFileSync(hbMdPath, 'utf8');
    const tasks = content.match(/### \d+\..+/g);
    items.periodicTasks = tasks || [];
  }

  return items;
}

async function sectionSystem() {
  const items = {};

  items.hostname = os.hostname();
  items.platform = `${os.platform()}/${os.arch()}`;
  items.nodeVersion = process.version;
  items.uptime = `${Math.round(os.uptime() / 3600)}h`;
  items.memory = {
    total: `${Math.round(os.totalmem() / 1024 / 1024)}MB`,
    free: `${Math.round(os.freemem() / 1024 / 1024)}MB`,
    usage: `${Math.round((1 - os.freemem() / os.totalmem()) * 100)}%`
  };

  // Disk usage
  try {
    const df = execSync('df -h / --output=size,used,avail,pcent 2>/dev/null | tail -1', { encoding: 'utf8' }).trim();
    items.disk = df;
  } catch { items.disk = '(unavailable)'; }

  // Process count
  try {
    const procs = execSync('pgrep -c node 2>/dev/null || echo 0', { encoding: 'utf8' }).trim();
    items.nodeProcesses = parseInt(procs, 10);
  } catch { items.nodeProcesses = -1; }

  return items;
}

async function sectionSkills() {
  const skillsDir = path.join(WORKSPACE, 'skills');
  const items = { count: 0, categories: {} };

  if (!fs.existsSync(skillsDir)) return items;

  const dirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  items.count = dirs.length;

  // Categorize by prefix patterns
  const categories = {
    security: [], feishu: [], media: [], monitoring: [],
    research: [], automation: [], utility: [], other: []
  };

  for (const name of dirs) {
    if (/security|threat|prompt-guard|secret|sentinel|audit/.test(name)) categories.security.push(name);
    else if (/feishu/.test(name)) categories.feishu.push(name);
    else if (/image|video|audio|tts|voice|banana|vap|gif/.test(name)) categories.media.push(name);
    else if (/monitor|health|uptime|sensor|firms|ioda|usgs|radiation/.test(name)) categories.monitoring.push(name);
    else if (/research|intel|news|hn|reddit|grok|search/.test(name)) categories.research.push(name);
    else if (/cron|timer|evolver|pipeline|task|todo/.test(name)) categories.automation.push(name);
    else if (/exec|memory|workspace|disk|env|config|git|skill/.test(name)) categories.utility.push(name);
    else categories.other.push(name);
  }

  // Remove empty categories
  for (const [k, v] of Object.entries(categories)) {
    if (v.length > 0) items.categories[k] = v;
  }

  return items;
}

async function sectionIdentity() {
  const items = {};

  // IDENTITY.md
  const idPath = path.join(WORKSPACE, 'IDENTITY.md');
  if (fs.existsSync(idPath)) {
    const content = fs.readFileSync(idPath, 'utf8');
    const nameMatch = content.match(/Name:\*\*\s*(.+)/);
    const modelMatch = content.match(/Model:\*\*\s*(.+)/);
    items.name = nameMatch ? nameMatch[1].trim() : 'Unknown';
    items.model = modelMatch ? modelMatch[1].trim() : 'Unknown';
  }

  // USER.md (non-sensitive parts)
  const userPath = path.join(WORKSPACE, 'USER.md');
  if (fs.existsSync(userPath)) {
    const content = fs.readFileSync(userPath, 'utf8');
    const tzMatch = content.match(/Timezone:\*\*\s*(.+)/);
    items.userTimezone = tzMatch ? tzMatch[1].trim() : 'Unknown';
  }

  return items;
}

// ── Briefing Generator ────────────────────────────────────

const SECTION_MAP = {
  memory: sectionMemory,
  tasks: sectionTasks,
  system: sectionSystem,
  skills: sectionSkills,
  identity: sectionIdentity,
};

async function generateBriefing(opts = {}) {
  const sections = opts.section
    ? [opts.section]
    : Object.keys(SECTION_MAP);

  const result = {};
  for (const name of sections) {
    if (SECTION_MAP[name]) {
      result[name] = await SECTION_MAP[name]();
    }
  }

  if (opts.json) return result;

  // Format as markdown
  let md = `# Context Briefing\n_Generated: ${new Date().toISOString()}_\n\n`;

  if (result.identity) {
    md += `## Identity\n- Agent: ${result.identity.name || 'Unknown'}\n- Model: ${result.identity.model || 'Unknown'}\n\n`;
  }

  if (result.system) {
    const s = result.system;
    md += `## System\n- Host: ${s.hostname} | ${s.platform} | Node ${s.nodeVersion}\n`;
    md += `- Uptime: ${s.uptime} | RAM: ${s.memory.usage} used (${s.memory.free} free)\n`;
    md += `- Disk: ${s.disk}\n- Node processes: ${s.nodeProcesses}\n\n`;
  }

  if (result.memory) {
    md += `## Active State\n${result.memory.activeState || '(none)'}\n\n`;
    if (result.memory.pendingTodos && result.memory.pendingTodos.length > 0) {
      md += `## Pending TODOs\n${result.memory.pendingTodos.join('\n')}\n\n`;
    }
    for (const [key, val] of Object.entries(result.memory)) {
      if (key.startsWith('notes_') && val) {
        md += `## Notes (${key.replace('notes_', '')})\n${val}\n\n`;
      }
    }
  }

  if (result.tasks) {
    md += `## Periodic Tasks\n`;
    if (result.tasks.periodicTasks) {
      md += result.tasks.periodicTasks.join('\n') + '\n';
    }
    md += '\n';
  }

  if (result.skills) {
    md += `## Skills (${result.skills.count} total)\n`;
    for (const [cat, names] of Object.entries(result.skills.categories || {})) {
      md += `- **${cat}** (${names.length}): ${names.join(', ')}\n`;
    }
    md += '\n';
  }

  // Compact mode: aggressively trim
  if (opts.compact) {
    // Remove verbose sections, keep only essentials
    const lines = md.split('\n');
    const compactLines = [];
    let skip = false;
    for (const line of lines) {
      // Skip verbose sections in compact mode
      if (line.startsWith('## Notes ') || line.startsWith('## Skills ')) { skip = true; continue; }
      if (skip && line.startsWith('## ')) { skip = false; }
      if (!skip) compactLines.push(line);
    }
    md = compactLines.join('\n');
    if (md.length > 2000) {
      md = md.slice(0, 1950) + '\n\n...(truncated)';
    }
  }

  return md;
}

async function getSection(name) {
  if (!SECTION_MAP[name]) return null;
  return SECTION_MAP[name]();
}

// ── CLI ────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const flags = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') flags.json = true;
    else if (args[i] === '--compact') flags.compact = true;
    else if (args[i] === '--section' && args[i + 1]) { flags.section = args[++i]; }
    else if (args[i] === '--out' && args[i + 1]) { flags.outFile = args[++i]; }
  }

  const result = await generateBriefing(flags);

  const output = flags.json ? JSON.stringify(result, null, 2) : result;

  if (flags.outFile) {
    fs.writeFileSync(flags.outFile, output, 'utf8');
    console.log(`Briefing written to ${flags.outFile}`);
  } else {
    console.log(output);
  }
}

// ── Exports ────────────────────────────────────────────────

module.exports = { generateBriefing, getSection, main };

if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
