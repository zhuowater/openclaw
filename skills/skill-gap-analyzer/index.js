/**
 * skill-gap-analyzer — Identify unmet user needs by analyzing session logs
 *
 * Scans session transcripts for:
 *  1. Frequent exec commands (repeated patterns → skill opportunity)
 *  2. Tool errors / retries (brittle integrations)
 *  3. Multi-step manual sequences (automation candidates)
 *  4. Unmapped user intents (requests not served by existing skills)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(process.env.HOME || '/root', '.openclaw/agents/main/sessions');
const SKILLS_DIR = path.resolve(__dirname, '..');
const ARCHIVE_DIR = path.join(SESSIONS_DIR, 'archive');

// ──────────── Helpers ────────────

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
  const results = [];
  for (const line of lines) {
    try { results.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return results;
}

function getSessionFiles(daysBack = 7) {
  const cutoff = Date.now() - daysBack * 86400000;
  const files = [];

  for (const dir of [SESSIONS_DIR, ARCHIVE_DIR]) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
    for (const entry of entries) {
      const fp = path.join(dir, entry);
      try {
        const stat = fs.statSync(fp);
        if (stat.mtimeMs >= cutoff) files.push(fp);
      } catch { /* skip */ }
    }
  }
  return files;
}

function listSkills() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs.readdirSync(SKILLS_DIR)
    .filter(d => {
      const fp = path.join(SKILLS_DIR, d);
      return fs.statSync(fp).isDirectory() && d !== 'skill-gap-analyzer';
    });
}

// ──────────── Analyzers ────────────

/**
 * Extract exec commands from session messages
 * OpenClaw format: assistant messages have content[].type="toolCall" with .name and .arguments
 * Tool results have message.role="toolResult" with .toolName
 */
function extractExecCalls(records) {
  const commands = [];
  for (const rec of records) {
    if (rec.type !== 'message' || !rec.message) continue;
    const msg = rec.message;
    const content = msg.content;
    if (!content) continue;

    // Assistant tool calls: content[].type="toolCall"
    if (msg.role === 'assistant' && Array.isArray(content)) {
      for (const part of content) {
        if (part.type === 'toolCall' && part.name === 'exec') {
          const args = part.arguments || {};
          const cmd = args.command || '';
          if (cmd) commands.push(cmd);
        }
      }
    }
  }
  return commands;
}

/**
 * Extract tool errors from session messages
 * OpenClaw format: toolResult messages with status "error" in details
 */
function extractToolErrors(records) {
  const errors = [];
  for (const rec of records) {
    if (rec.type !== 'message' || !rec.message) continue;
    const msg = rec.message;

    if (msg.role === 'toolResult') {
      // Check for error indicators
      const details = msg.details || {};
      const isError = details.status === 'error' || details.is_error;
      const contentText = Array.isArray(msg.content)
        ? msg.content.map(c => c.text || '').join(' ')
        : String(msg.content || '');

      // Also detect errors by content patterns
      const hasErrorPattern = /error|Error|ERROR|failed|FAILED|exception|Exception/.test(contentText.slice(0, 300));

      if (isError || (hasErrorPattern && contentText.includes('"status":"error"'))) {
        errors.push({
          toolName: msg.toolName || 'unknown',
          error: contentText.slice(0, 200),
        });
      }
    }
  }
  return errors;
}

/**
 * Count tool usage by name
 * Counts both assistant toolCall and toolResult messages
 */
function countToolUsage(records) {
  const counts = {};
  for (const rec of records) {
    if (rec.type !== 'message' || !rec.message) continue;
    const msg = rec.message;

    // Count from assistant tool calls
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'toolCall') {
          const name = part.name || 'unknown';
          counts[name] = (counts[name] || 0) + 1;
        }
      }
    }
  }
  return counts;
}

/**
 * Find repeated command patterns (same base command 3+ times)
 */
function findRepeatedCommands(commands) {
  // Normalize commands: strip arguments, keep base command
  const baseCommands = {};
  for (const cmd of commands) {
    // Extract the first meaningful command (skip cd, env vars)
    const cleaned = cmd.replace(/^(cd [^;&]+[;&]\s*)+/, '').trim();
    const base = cleaned.split(/\s+/).slice(0, 3).join(' ');
    if (base.length < 3) continue;
    if (!baseCommands[base]) baseCommands[base] = { count: 0, examples: [] };
    baseCommands[base].count++;
    if (baseCommands[base].examples.length < 3) {
      baseCommands[base].examples.push(cmd.slice(0, 120));
    }
  }

  return Object.entries(baseCommands)
    .filter(([_, v]) => v.count >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([base, v]) => ({ pattern: base, count: v.count, examples: v.examples }));
}

/**
 * Identify multi-step sequences (consecutive exec calls that form a workflow)
 */
function findMultiStepSequences(commands) {
  const sequences = [];
  let currentSeq = [];

  for (const cmd of commands) {
    if (currentSeq.length === 0) {
      currentSeq.push(cmd);
    } else {
      // Heuristic: if commands share a common directory or theme, they're a sequence
      const lastCmd = currentSeq[currentSeq.length - 1];
      const shareContext = extractContext(cmd) === extractContext(lastCmd);
      if (shareContext && currentSeq.length < 8) {
        currentSeq.push(cmd);
      } else {
        if (currentSeq.length >= 3) {
          sequences.push([...currentSeq]);
        }
        currentSeq = [cmd];
      }
    }
  }
  if (currentSeq.length >= 3) sequences.push(currentSeq);

  return sequences;
}

function extractContext(cmd) {
  // Extract working directory or main tool from command
  const cdMatch = cmd.match(/cd\s+([^\s;&]+)/);
  if (cdMatch) return cdMatch[1];
  const toolMatch = cmd.match(/^(node|python|curl|git|npm|jq)\b/);
  if (toolMatch) return toolMatch[1];
  return 'misc';
}

/**
 * Map existing skills to detect coverage gaps
 */
function mapSkillCoverage(skills) {
  const categories = {
    'intelligence': [],
    'trading': [],
    'security': [],
    'feishu': [],
    'media': [],
    'code': [],
    'system': [],
    'other': [],
  };

  for (const skill of skills) {
    const name = skill.toLowerCase();
    if (name.includes('intel') || name.includes('firms') || name.includes('ioda') || name.includes('osint') || name.includes('gdelt') || name.includes('adsb') || name.includes('earthquake') || name.includes('radiation')) {
      categories.intelligence.push(skill);
    } else if (name.includes('poly') || name.includes('commodity') || name.includes('trading')) {
      categories.trading.push(skill);
    } else if (name.includes('security') || name.includes('secret') || name.includes('audit') || name.includes('scanner') || name.includes('threat') || name.includes('prompt-guard')) {
      categories.security.push(skill);
    } else if (name.includes('feishu') || name.includes('lark')) {
      categories.feishu.push(skill);
    } else if (name.includes('image') || name.includes('video') || name.includes('audio') || name.includes('tts') || name.includes('whisper') || name.includes('banana') || name.includes('gif')) {
      categories.media.push(skill);
    } else if (name.includes('code') || name.includes('git') || name.includes('github') || name.includes('commit') || name.includes('changelog') || name.includes('dep') || name.includes('todo')) {
      categories.code.push(skill);
    } else if (name.includes('memory') || name.includes('janitor') || name.includes('workspace') || name.includes('cron') || name.includes('config') || name.includes('runtime') || name.includes('sysinfo') || name.includes('exec') || name.includes('pipeline') || name.includes('uptime') || name.includes('env-doctor') || name.includes('skill-health') || name.includes('skill-gap') || name.includes('perf-metric') || name.includes('activity-digest')) {
      categories.system.push(skill);
    } else {
      categories.other.push(skill);
    }
  }

  return categories;
}

// ──────────── Main ────────────

async function analyze(options = {}) {
  const { days = 7, top = 10, json = false } = options;

  const sessionFiles = getSessionFiles(days);
  const skills = listSkills();

  let allCommands = [];
  let allErrors = [];
  let toolUsage = {};

  for (const fp of sessionFiles) {
    const records = readJsonl(fp);
    const commands = extractExecCalls(records);
    const errors = extractToolErrors(records);
    const usage = countToolUsage(records);

    allCommands.push(...commands);
    allErrors.push(...errors);
    for (const [tool, count] of Object.entries(usage)) {
      toolUsage[tool] = (toolUsage[tool] || 0) + count;
    }
  }

  const repeatedCommands = findRepeatedCommands(allCommands);
  const multiStepSeqs = findMultiStepSequences(allCommands);
  const skillCoverage = mapSkillCoverage(skills);

  // Build gap candidates
  const gaps = [];

  // Gap 1: Repeated exec patterns that could be skills
  for (const rc of repeatedCommands.slice(0, 5)) {
    // Check if there's already a skill covering this
    const covered = skills.some(s =>
      rc.pattern.includes(s) || s.includes(rc.pattern.split(' ')[0])
    );
    if (!covered) {
      gaps.push({
        type: 'repeated_command',
        description: `Repeated command pattern: "${rc.pattern}" (${rc.count}× in ${days}d)`,
        evidence: rc.examples,
        suggestedSkill: `auto-${rc.pattern.split(' ')[0].replace(/[^a-z0-9]/gi, '-')}`,
        impact: rc.count >= 10 ? 'high' : rc.count >= 5 ? 'medium' : 'low',
        complexity: 'low',
      });
    }
  }

  // Gap 2: High error rate tools
  const errorsByTool = {};
  for (const err of allErrors) {
    const key = err.error.slice(0, 50);
    if (!errorsByTool[key]) errorsByTool[key] = { count: 0, sample: err.error };
    errorsByTool[key].count++;
  }
  for (const [key, val] of Object.entries(errorsByTool)) {
    if (val.count >= 3) {
      gaps.push({
        type: 'recurring_error',
        description: `Recurring error (${val.count}×): ${val.sample.slice(0, 100)}`,
        evidence: [val.sample],
        suggestedSkill: 'error-handler-enhancement',
        impact: val.count >= 5 ? 'high' : 'medium',
        complexity: 'medium',
      });
    }
  }

  // Gap 3: Multi-step sequences → automation opportunities
  for (const seq of multiStepSeqs.slice(0, 3)) {
    gaps.push({
      type: 'multi_step_workflow',
      description: `${seq.length}-step manual workflow detected`,
      evidence: seq.map(c => c.slice(0, 100)),
      suggestedSkill: `workflow-${extractContext(seq[0])}`,
      impact: seq.length >= 5 ? 'high' : 'medium',
      complexity: 'medium',
    });
  }

  // Gap 4: Category imbalance
  const catSizes = Object.entries(skillCoverage).map(([cat, skills]) => ({ cat, count: skills.length }));
  catSizes.sort((a, b) => a.count - b.count);
  const weakestCat = catSizes[0];
  if (weakestCat && weakestCat.count < 3) {
    gaps.push({
      type: 'category_gap',
      description: `Weak category: "${weakestCat.cat}" has only ${weakestCat.count} skill(s)`,
      evidence: skillCoverage[weakestCat.cat],
      suggestedSkill: `${weakestCat.cat}-enhancement`,
      impact: 'medium',
      complexity: 'medium',
    });
  }

  // Sort gaps by impact
  const impactOrder = { high: 0, medium: 1, low: 2 };
  gaps.sort((a, b) => (impactOrder[a.impact] || 2) - (impactOrder[b.impact] || 2));

  const result = {
    scanMeta: {
      sessionsScanned: sessionFiles.length,
      daysBack: days,
      totalExecCalls: allCommands.length,
      totalToolErrors: allErrors.length,
      totalSkills: skills.length,
      generatedAt: new Date().toISOString(),
    },
    toolUsage: Object.entries(toolUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, count]) => ({ name, count })),
    skillCoverage: Object.fromEntries(
      Object.entries(skillCoverage).map(([cat, skills]) => [cat, skills.length])
    ),
    gaps: gaps.slice(0, top),
  };

  return result;
}

function formatReport(result) {
  const lines = [];
  lines.push('═══════════════════════════════════════════');
  lines.push('  Skill Gap Analysis Report');
  lines.push('═══════════════════════════════════════════');
  lines.push('');

  const m = result.scanMeta;
  lines.push(`📊 Scanned: ${m.sessionsScanned} sessions (${m.daysBack}d) | ${m.totalExecCalls} exec calls | ${m.totalToolErrors} errors | ${m.totalSkills} skills`);
  lines.push('');

  // Tool usage
  lines.push('🔧 Top Tool Usage:');
  for (const t of result.toolUsage.slice(0, 8)) {
    const bar = '█'.repeat(Math.min(20, Math.ceil(t.count / 5)));
    lines.push(`  ${t.name.padEnd(20)} ${String(t.count).padStart(4)} ${bar}`);
  }
  lines.push('');

  // Skill coverage
  lines.push('📦 Skill Coverage by Category:');
  for (const [cat, count] of Object.entries(result.skillCoverage)) {
    const bar = '█'.repeat(count);
    lines.push(`  ${cat.padEnd(15)} ${String(count).padStart(3)} ${bar}`);
  }
  lines.push('');

  // Gaps
  if (result.gaps.length > 0) {
    lines.push('🎯 Identified Gaps:');
    for (let i = 0; i < result.gaps.length; i++) {
      const g = result.gaps[i];
      const icon = g.impact === 'high' ? '🔴' : g.impact === 'medium' ? '🟡' : '⚪';
      lines.push(`  ${icon} #${i + 1}: ${g.description}`);
      lines.push(`     Type: ${g.type} | Impact: ${g.impact} | Complexity: ${g.complexity}`);
      if (g.suggestedSkill) lines.push(`     Suggested: ${g.suggestedSkill}`);
      if (g.evidence && g.evidence.length > 0) {
        lines.push(`     Evidence: ${g.evidence[0].slice(0, 80)}`);
      }
      lines.push('');
    }
  } else {
    lines.push('✅ No significant gaps detected!');
  }

  lines.push(`\nGenerated: ${result.scanMeta.generatedAt}`);
  return lines.join('\n');
}

// ──────────── CLI ────────────

async function main() {
  const args = process.argv.slice(2);
  const daysIdx = args.indexOf('--days');
  const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1]) || 7 : 7;
  const topIdx = args.indexOf('--top');
  const top = topIdx >= 0 ? parseInt(args[topIdx + 1]) || 10 : 10;
  const jsonMode = args.includes('--json');

  const result = await analyze({ days, top, json: jsonMode });

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatReport(result));
  }

  return result;
}

if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = { analyze, formatReport, main };
