#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const INCIDENTS_DIR = path.join(process.env.HOME || '/root', 'openclaw', 'memory', 'incidents');
const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low'];
const PHASES = ['detection', 'triage', 'containment', 'eradication', 'recovery', 'lessons_learned', 'closed'];

// Ensure incidents directory exists
function ensureDir() {
  if (!fs.existsSync(INCIDENTS_DIR)) {
    fs.mkdirSync(INCIDENTS_DIR, { recursive: true });
  }
}

// Generate next incident ID
function nextId() {
  ensureDir();
  const files = fs.readdirSync(INCIDENTS_DIR).filter(f => f.startsWith('INC-') && f.endsWith('.json'));
  const nums = files.map(f => parseInt(f.replace('INC-', '').replace('.json', ''), 10)).filter(n => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `INC-${String(next).padStart(3, '0')}`;
}

// Load incident by ID
function loadIncident(id) {
  const fp = path.join(INCIDENTS_DIR, `${id}.json`);
  if (!fs.existsSync(fp)) {
    throw new Error(`Incident ${id} not found`);
  }
  return JSON.parse(fs.readFileSync(fp, 'utf-8'));
}

// Save incident
function saveIncident(incident) {
  ensureDir();
  const fp = path.join(INCIDENTS_DIR, `${incident.id}.json`);
  fs.writeFileSync(fp, JSON.stringify(incident, null, 2) + '\n');
}

// Severity score for sorting
function severityScore(sev) {
  return { critical: 4, high: 3, medium: 2, low: 1 }[sev] || 0;
}

// --- Commands ---

function cmdNew(args) {
  const title = args['--title'] || args.title || 'Untitled Incident';
  const severity = args['--severity'] || args.severity || 'medium';
  if (!SEVERITY_LEVELS.includes(severity)) {
    console.error(`Invalid severity: ${severity}. Must be one of: ${SEVERITY_LEVELS.join(', ')}`);
    process.exit(1);
  }
  const id = nextId();
  const now = new Date().toISOString();
  const incident = {
    id,
    title,
    severity,
    phase: 'detection',
    created_at: now,
    updated_at: now,
    timeline: [
      { time: now, phase: 'detection', action: 'Incident created', actor: 'system' }
    ],
    evidence: [],
    containment_actions: [],
    lessons_learned: [],
    status: 'open'
  };
  saveIncident(incident);
  console.log(JSON.stringify({ ok: true, id, title, severity, phase: 'detection', created_at: now }));
  return incident;
}

function cmdList() {
  ensureDir();
  const files = fs.readdirSync(INCIDENTS_DIR).filter(f => f.startsWith('INC-') && f.endsWith('.json'));
  const incidents = files.map(f => {
    try {
      const inc = JSON.parse(fs.readFileSync(path.join(INCIDENTS_DIR, f), 'utf-8'));
      return { id: inc.id, title: inc.title, severity: inc.severity, phase: inc.phase, status: inc.status, created_at: inc.created_at };
    } catch { return null; }
  }).filter(Boolean);
  
  // Sort: open first, then by severity
  incidents.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return severityScore(b.severity) - severityScore(a.severity);
  });
  
  if (incidents.length === 0) {
    console.log('No incidents found.');
  } else {
    console.log(JSON.stringify(incidents, null, 2));
  }
  return incidents;
}

function cmdEvidence(args) {
  const id = args['--id'] || args.id;
  if (!id) { console.error('--id required'); process.exit(1); }
  const type = args['--type'] || args.type || 'note';
  const note = args['--note'] || args.note || '';
  
  const incident = loadIncident(id);
  const now = new Date().toISOString();
  const entry = { time: now, type, note };
  incident.evidence.push(entry);
  incident.timeline.push({ time: now, phase: incident.phase, action: `Evidence added: [${type}] ${note.substring(0, 100)}`, actor: 'analyst' });
  incident.updated_at = now;
  saveIncident(incident);
  console.log(JSON.stringify({ ok: true, id, evidence_count: incident.evidence.length }));
}

function cmdPhase(args) {
  const id = args['--id'] || args.id;
  const phase = args['--phase'] || args.phase;
  if (!id || !phase) { console.error('--id and --phase required'); process.exit(1); }
  if (!PHASES.includes(phase)) {
    console.error(`Invalid phase: ${phase}. Must be one of: ${PHASES.join(', ')}`);
    process.exit(1);
  }
  
  const incident = loadIncident(id);
  const now = new Date().toISOString();
  const oldPhase = incident.phase;
  incident.phase = phase;
  incident.updated_at = now;
  incident.timeline.push({ time: now, phase, action: `Phase transition: ${oldPhase} → ${phase}`, actor: 'analyst' });
  saveIncident(incident);
  console.log(JSON.stringify({ ok: true, id, old_phase: oldPhase, new_phase: phase }));
}

function cmdReport(args) {
  const id = args['--id'] || args.id;
  if (!id) { console.error('--id required'); process.exit(1); }
  
  const incident = loadIncident(id);
  const duration = incident.status === 'closed' && incident.closed_at
    ? `${Math.round((new Date(incident.closed_at) - new Date(incident.created_at)) / 60000)} minutes`
    : 'ongoing';
  
  const report = {
    incident_report: {
      id: incident.id,
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
      current_phase: incident.phase,
      created_at: incident.created_at,
      duration,
      evidence_count: incident.evidence.length,
      timeline_entries: incident.timeline.length,
      timeline: incident.timeline,
      evidence: incident.evidence,
      containment_actions: incident.containment_actions,
      lessons_learned: incident.lessons_learned
    }
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

function cmdClose(args) {
  const id = args['--id'] || args.id;
  if (!id) { console.error('--id required'); process.exit(1); }
  const lesson = args['--lesson'] || args.lesson || '';
  
  const incident = loadIncident(id);
  const now = new Date().toISOString();
  incident.status = 'closed';
  incident.phase = 'closed';
  incident.closed_at = now;
  incident.updated_at = now;
  if (lesson) {
    incident.lessons_learned.push({ time: now, lesson });
  }
  incident.timeline.push({ time: now, phase: 'closed', action: `Incident closed${lesson ? ': ' + lesson.substring(0, 100) : ''}`, actor: 'analyst' });
  saveIncident(incident);
  console.log(JSON.stringify({ ok: true, id, status: 'closed', closed_at: now }));
}

// --- Exported API ---

function analyze(description, context) {
  // Quick severity assessment based on keywords
  const desc = (description || '').toLowerCase();
  const criticalPatterns = /breach|exfil|rce|ransomware|root\s*access|data\s*leak|0-?day/i;
  const highPatterns = /exploit|unauthorized|credential|privilege\s*escalation|injection|backdoor/i;
  const mediumPatterns = /anomal|suspicious|unusual|policy\s*violat|brute\s*force|scan/i;
  
  let severity = 'low';
  if (criticalPatterns.test(desc)) severity = 'critical';
  else if (highPatterns.test(desc)) severity = 'high';
  else if (mediumPatterns.test(desc)) severity = 'medium';
  
  const recommendations = [];
  if (severity === 'critical') {
    recommendations.push('IMMEDIATE: Isolate affected systems');
    recommendations.push('IMMEDIATE: Preserve evidence (memory dumps, logs)');
    recommendations.push('Notify incident commander and stakeholders');
    recommendations.push('Activate full incident response team');
  } else if (severity === 'high') {
    recommendations.push('Investigate scope and impact within 1 hour');
    recommendations.push('Collect relevant logs and artifacts');
    recommendations.push('Prepare containment plan');
  } else if (severity === 'medium') {
    recommendations.push('Schedule investigation within 4 hours');
    recommendations.push('Monitor for escalation indicators');
  } else {
    recommendations.push('Log for trend analysis');
    recommendations.push('Review during next scheduled assessment');
  }
  
  return {
    severity,
    description,
    recommendations,
    next_phase: severity === 'critical' ? 'containment' : 'triage',
    timestamp: new Date().toISOString()
  };
}

function report() {
  ensureDir();
  const files = fs.readdirSync(INCIDENTS_DIR).filter(f => f.startsWith('INC-') && f.endsWith('.json'));
  const incidents = files.map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(INCIDENTS_DIR, f), 'utf-8')); }
    catch { return null; }
  }).filter(Boolean);
  
  const open = incidents.filter(i => i.status === 'open');
  const closed = incidents.filter(i => i.status === 'closed');
  
  return {
    total: incidents.length,
    open: open.length,
    closed: closed.length,
    by_severity: {
      critical: incidents.filter(i => i.severity === 'critical').length,
      high: incidents.filter(i => i.severity === 'high').length,
      medium: incidents.filter(i => i.severity === 'medium').length,
      low: incidents.filter(i => i.severity === 'low').length
    },
    active_incidents: open.map(i => ({ id: i.id, title: i.title, severity: i.severity, phase: i.phase })),
    lessons_learned: closed.flatMap(i => i.lessons_learned || []).slice(-10)
  };
}

// --- CLI ---
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--') && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      args[argv[i]] = argv[i + 1];
      i++;
    } else if (!argv[i].startsWith('--')) {
      args._command = args._command || argv[i];
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._command;
  
  switch (command) {
    case 'new': return cmdNew(args);
    case 'list': return cmdList();
    case 'evidence': return cmdEvidence(args);
    case 'phase': return cmdPhase(args);
    case 'report': return cmdReport(args);
    case 'close': return cmdClose(args);
    default:
      console.log('Usage: node index.js <new|list|evidence|phase|report|close> [options]');
      console.log('  new      --title "..." --severity critical|high|medium|low');
      console.log('  list     (no args)');
      console.log('  evidence --id INC-001 --type log --note "..."');
      console.log('  phase    --id INC-001 --phase containment');
      console.log('  report   --id INC-001');
      console.log('  close    --id INC-001 --lesson "..."');
      process.exit(command ? 1 : 0);
  }
}

module.exports = { main, analyze, report };

if (require.main === module) {
  main();
}
