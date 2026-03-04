'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ROOT = '/root/openclaw';
const MEMORY_DIR = path.join(ROOT, 'memory');
const SKILLS_DIR = path.join(ROOT, 'skills');
const EVOLVER_ASSETS = path.join(SKILLS_DIR, 'evolver', 'assets', 'gep');

// ─── Helpers ───

function safeExec(cmd, timeout = 5000) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

function dirSizeBytes(dirPath) {
  try {
    const out = safeExec(`du -sb "${dirPath}" 2>/dev/null | cut -f1`);
    return out ? parseInt(out, 10) : 0;
  } catch {
    return 0;
  }
}

function humanSize(bytes) {
  if (bytes === 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / Math.pow(1024, i)).toFixed(1) + units[i];
}

function fileMtime(filePath) {
  try {
    return fs.statSync(filePath).mtime;
  } catch {
    return null;
  }
}

function hoursAgo(date) {
  return Math.round((Date.now() - date.getTime()) / 3600000);
}

// ─── Disk Breakdown ───

async function diskBreakdown() {
  const dfOut = safeExec('df -B1 / 2>/dev/null | tail -1');
  let system = { total: 0, used: 0, available: 0, percent: 0 };
  if (dfOut) {
    const p = dfOut.split(/\s+/);
    system = {
      total: parseInt(p[1], 10),
      used: parseInt(p[2], 10),
      available: parseInt(p[3], 10),
      percent: Math.round(parseInt(p[2], 10) / parseInt(p[1], 10) * 100),
    };
  }

  const categories = {
    memory: dirSizeBytes(MEMORY_DIR),
    skills: dirSizeBytes(SKILLS_DIR),
    evolution: dirSizeBytes(EVOLVER_ASSETS),
    git: dirSizeBytes(path.join(ROOT, '.git')),
  };
  categories.other = system.used - Object.values(categories).reduce((a, b) => a + b, 0);
  if (categories.other < 0) categories.other = 0;

  return { system, categories };
}

// ─── Memory Freshness ───

async function memoryFreshness() {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const yesterdayStr = new Date(now - 86400000).toISOString().slice(0, 10);

  const files = {
    'MEMORY.md': path.join(ROOT, 'MEMORY.md'),
    [`memory/${todayStr}.md`]: path.join(MEMORY_DIR, `${todayStr}.md`),
    [`memory/${yesterdayStr}.md`]: path.join(MEMORY_DIR, `${yesterdayStr}.md`),
    'heartbeat-state.json': path.join(MEMORY_DIR, 'heartbeat-state.json'),
  };

  const result = {};
  for (const [label, fp] of Object.entries(files)) {
    const mt = fileMtime(fp);
    if (mt) {
      const hrs = hoursAgo(mt);
      result[label] = {
        exists: true,
        lastModified: mt.toISOString(),
        hoursAgo: hrs,
        stale: hrs > 24,
        size: fs.statSync(fp).size,
      };
    } else {
      result[label] = { exists: false, stale: true };
    }
  }
  return result;
}

// ─── Skill Inventory ───

async function skillInventory() {
  const dirs = fs.readdirSync(SKILLS_DIR).filter(d => {
    try { return fs.statSync(path.join(SKILLS_DIR, d)).isDirectory(); } catch { return false; }
  });

  let withIndex = 0;
  let withSkillMd = 0;
  let withPkg = 0;
  const largest = [];

  for (const d of dirs) {
    const base = path.join(SKILLS_DIR, d);
    if (fs.existsSync(path.join(base, 'index.js'))) withIndex++;
    if (fs.existsSync(path.join(base, 'SKILL.md'))) withSkillMd++;
    if (fs.existsSync(path.join(base, 'package.json'))) withPkg++;
    const sz = dirSizeBytes(base);
    largest.push({ name: d, size: sz });
  }

  largest.sort((a, b) => b.size - a.size);

  return {
    total: dirs.length,
    withIndex,
    withSkillMd,
    withPackageJson: withPkg,
    codeSkills: withIndex,
    instructionOnly: dirs.length - withIndex,
    top5Largest: largest.slice(0, 5).map(s => ({ name: s.name, size: humanSize(s.size) })),
  };
}

// ─── Evolution Health ───

async function evolutionHealth() {
  const eventsFile = path.join(EVOLVER_ASSETS, 'events.jsonl');
  const candidatesFile = path.join(EVOLVER_ASSETS, 'candidates.jsonl');

  let events = [];
  if (fs.existsSync(eventsFile)) {
    const lines = fs.readFileSync(eventsFile, 'utf8').split('\n').filter(l => l.trim());
    for (const l of lines) {
      try {
        const obj = JSON.parse(l);
        if (obj.type === 'EvolutionEvent') events.push(obj);
      } catch {}
    }
  }

  const total = events.length;
  const successes = events.filter(e => e.outcome?.status === 'success').length;
  const failures = events.filter(e => e.outcome?.status === 'failed').length;
  const intents = {};
  for (const e of events) {
    intents[e.intent] = (intents[e.intent] || 0) + 1;
  }

  let lastEvent = events.length > 0 ? events[events.length - 1] : null;
  let streak = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].outcome?.status === 'success') streak++;
    else break;
  }

  let candidatesSize = 0;
  let candidatesLines = 0;
  if (fs.existsSync(candidatesFile)) {
    candidatesSize = fs.statSync(candidatesFile).size;
    candidatesLines = fs.readFileSync(candidatesFile, 'utf8').split('\n').filter(l => l.trim()).length;
  }

  return {
    totalCycles: total,
    successes,
    failures,
    successRate: total > 0 ? Math.round(successes / total * 100) : 0,
    currentStreak: streak,
    intentBreakdown: intents,
    lastEvent: lastEvent ? {
      id: lastEvent.id,
      intent: lastEvent.intent,
      signals: lastEvent.signals,
      outcome: lastEvent.outcome,
      at: lastEvent.meta?.at,
    } : null,
    candidates: {
      size: humanSize(candidatesSize),
      lines: candidatesLines,
      bloated: candidatesSize > 10 * 1024 * 1024,
    },
  };
}

// ─── Recommendations ───

async function generateRecommendations(disk, memory, skills, evolution) {
  const recs = [];

  // Disk recommendations
  if (disk.system.percent > 80) {
    recs.push({ severity: 'HIGH', area: 'disk', message: `Disk ${disk.system.percent}% full — consider cleanup` });
  }
  if (disk.categories.evolution > 50 * 1024 * 1024) {
    recs.push({ severity: 'MEDIUM', area: 'evolution', message: `GEP assets ${humanSize(disk.categories.evolution)} — run memory-janitor` });
  }

  // Memory recommendations
  for (const [label, info] of Object.entries(memory)) {
    if (!info.exists && label.includes('memory/')) {
      recs.push({ severity: 'LOW', area: 'memory', message: `${label} missing — daily notes not started` });
    }
    if (info.stale && info.exists) {
      recs.push({ severity: 'MEDIUM', area: 'memory', message: `${label} stale (${info.hoursAgo}h ago)` });
    }
  }

  // Evolution recommendations
  if (evolution.candidates.bloated) {
    recs.push({ severity: 'MEDIUM', area: 'evolution', message: `candidates.jsonl bloated: ${evolution.candidates.size} / ${evolution.candidates.lines} lines` });
  }
  if (evolution.successRate < 60 && evolution.totalCycles > 5) {
    recs.push({ severity: 'HIGH', area: 'evolution', message: `Low evolution success rate: ${evolution.successRate}%` });
  }

  return recs;
}

// ─── Full Report ───

async function fullReport() {
  const disk = await diskBreakdown();
  const memory = await memoryFreshness();
  const skills = await skillInventory();
  const evolution = await evolutionHealth();
  const recommendations = await generateRecommendations(disk, memory, skills, evolution);

  return { timestamp: new Date().toISOString(), disk, memory, skills, evolution, recommendations };
}

// ─── CLI ───

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const sectionArg = args.find(a => a.startsWith('--section'));
  const section = sectionArg ? args[args.indexOf(sectionArg) + 1] : null;

  let result;
  if (section === 'disk') result = await diskBreakdown();
  else if (section === 'memory') result = await memoryFreshness();
  else if (section === 'skills') result = await skillInventory();
  else if (section === 'evolution') result = await evolutionHealth();
  else result = await fullReport();

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Human-readable output
  if (section) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const r = result;
  console.log('═══ Workspace Health Report ═══');
  console.log(`📅 ${r.timestamp}\n`);

  // Disk
  console.log('💾 DISK');
  console.log(`  System: ${humanSize(r.disk.system.used)} / ${humanSize(r.disk.system.total)} (${r.disk.system.percent}%)`);
  console.log(`  Free: ${humanSize(r.disk.system.available)}`);
  for (const [cat, sz] of Object.entries(r.disk.categories)) {
    console.log(`  ${cat}: ${humanSize(sz)}`);
  }

  // Memory
  console.log('\n📝 MEMORY');
  for (const [label, info] of Object.entries(r.memory)) {
    if (info.exists) {
      const staleTag = info.stale ? ' ⚠️ STALE' : ' ✅';
      console.log(`  ${label}: ${humanSize(info.size)}, ${info.hoursAgo}h ago${staleTag}`);
    } else {
      console.log(`  ${label}: ❌ MISSING`);
    }
  }

  // Skills
  console.log('\n🔧 SKILLS');
  console.log(`  Total: ${r.skills.total} (${r.skills.codeSkills} code + ${r.skills.instructionOnly} instruction-only)`);
  console.log(`  With SKILL.md: ${r.skills.withSkillMd}, With package.json: ${r.skills.withPackageJson}`);
  console.log('  Top 5 largest:');
  for (const s of r.skills.top5Largest) {
    console.log(`    ${s.name}: ${s.size}`);
  }

  // Evolution
  console.log('\n🧬 EVOLUTION');
  console.log(`  Cycles: ${r.evolution.totalCycles} (${r.evolution.successes}✓ ${r.evolution.failures}✗, ${r.evolution.successRate}% success)`);
  console.log(`  Current streak: ${r.evolution.currentStreak} successes`);
  console.log(`  Intents: ${JSON.stringify(r.evolution.intentBreakdown)}`);
  console.log(`  Candidates: ${r.evolution.candidates.size} / ${r.evolution.candidates.lines} lines${r.evolution.candidates.bloated ? ' ⚠️ BLOATED' : ''}`);
  if (r.evolution.lastEvent) {
    console.log(`  Last: ${r.evolution.lastEvent.intent} [${r.evolution.lastEvent.outcome?.status}] at ${r.evolution.lastEvent.at || 'unknown'}`);
  }

  // Recommendations
  if (r.recommendations.length > 0) {
    console.log('\n⚡ RECOMMENDATIONS');
    for (const rec of r.recommendations) {
      const icon = rec.severity === 'HIGH' ? '🔴' : rec.severity === 'MEDIUM' ? '🟡' : '🟢';
      console.log(`  ${icon} [${rec.area}] ${rec.message}`);
    }
  } else {
    console.log('\n✅ No issues detected');
  }
}

module.exports = { fullReport, diskBreakdown, memoryFreshness, skillInventory, evolutionHealth, generateRecommendations };

if (require.main === module) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
