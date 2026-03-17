'use strict';

/**
 * notification-router — Smart notification routing & escalation
 * 
 * Scores event severity and routes to appropriate channel:
 *   LOW    → feishu message (batched)
 *   MEDIUM → feishu message (immediate)
 *   HIGH   → feishu urgent buzz
 *   CRITICAL → phone call via Twilio
 */

const LEVELS = {
  LOW:      { min: 0,  max: 30, channel: 'feishu_message',  label: 'LOW' },
  MEDIUM:   { min: 31, max: 60, channel: 'feishu_message',  label: 'MEDIUM' },
  HIGH:     { min: 61, max: 80, channel: 'feishu_urgent',   label: 'HIGH' },
  CRITICAL: { min: 81, max: 100, channel: 'phone_call',     label: 'CRITICAL' },
};

const QUIET_START = 23;
const QUIET_END = 8;

function isQuietHours() {
  const hour = new Date().getHours(); // relies on TZ=Asia/Shanghai in env
  return hour >= QUIET_START || hour < QUIET_END;
}

function levelFromScore(s) {
  if (s >= LEVELS.CRITICAL.min) return LEVELS.CRITICAL;
  if (s >= LEVELS.HIGH.min) return LEVELS.HIGH;
  if (s >= LEVELS.MEDIUM.min) return LEVELS.MEDIUM;
  return LEVELS.LOW;
}

/**
 * Score a market event.
 * @param {object} opts
 * @param {number} opts.pctChange  - absolute percentage change
 * @param {number} [opts.lossUSD]  - dollar loss if known
 * @returns {number} 0-100
 */
function scoreMarket({ pctChange = 0, lossUSD = 0 } = {}) {
  const absPct = Math.abs(pctChange);
  let s = 0;
  if (absPct >= 30) s = 90;
  else if (absPct >= 15) s = 70;
  else if (absPct >= 5) s = 50;
  else if (absPct >= 2) s = 30;
  else s = 15;
  if (lossUSD > 500) s = Math.min(100, s + 20);
  return s;
}

/**
 * Score a security event.
 * @param {object} opts
 * @param {number} [opts.cvss]
 * @param {boolean} [opts.exploited]
 * @param {boolean} [opts.affectsUs]
 * @returns {number}
 */
function scoreSecurity({ cvss = 0, exploited = false, affectsUs = false } = {}) {
  let s = 0;
  if (cvss >= 9 && exploited) s = 95;
  else if (cvss >= 9) s = 75;
  else if (cvss >= 7) s = 55;
  else if (cvss >= 4) s = 35;
  else s = 20;
  if (affectsUs) s = Math.min(100, s + 15);
  return s;
}

/**
 * Score a system event.
 * @param {object} opts
 * @param {boolean} [opts.serviceDown]
 * @param {number}  [opts.diskPct]
 * @param {number}  [opts.memPct]
 * @returns {number}
 */
function scoreSystem({ serviceDown = false, diskPct = 0, memPct = 0 } = {}) {
  let s = 0;
  if (serviceDown) s = 70;
  if (diskPct > 95) s = Math.max(s, 65);
  else if (diskPct > 90) s = Math.max(s, 45);
  if (memPct > 95) s = Math.max(s, 60);
  else if (memPct > 90) s = Math.max(s, 50);
  return s || 20;
}

/**
 * Score a custom/text event based on keywords.
 * @param {object} opts
 * @param {string} opts.description
 * @returns {number}
 */
function scoreCustom({ description = '' } = {}) {
  const d = description.toLowerCase();
  if (/critical|emergency|紧急|严重/.test(d)) return 85;
  if (/urgent|重要|high/.test(d)) return 70;
  if (/warning|注意|medium/.test(d)) return 50;
  return 30;
}

/**
 * Main scoring function.
 * @param {object} event
 * @param {string} event.type  - market|security|system|custom
 * @param {string} event.description
 * @param {object} [event.indicators]
 * @returns {{ level: string, score: number, channel: string, quietAdjusted: boolean }}
 */
function score(event) {
  const { type = 'custom', description = '', indicators = {} } = event;
  let raw;
  switch (type) {
    case 'market':
      raw = scoreMarket(indicators);
      break;
    case 'security':
      raw = scoreSecurity(indicators);
      break;
    case 'system':
      raw = scoreSystem(indicators);
      break;
    default:
      raw = scoreCustom({ description, ...indicators });
  }

  let adjusted = raw;
  let quietAdjusted = false;
  if (isQuietHours() && raw < LEVELS.CRITICAL.min) {
    // Downgrade by ~20 points during quiet hours (never below 0)
    adjusted = Math.max(0, raw - 20);
    quietAdjusted = true;
  }

  const level = levelFromScore(adjusted);
  return {
    level: level.label,
    score: adjusted,
    rawScore: raw,
    channel: level.channel,
    quietAdjusted,
    description,
  };
}

/**
 * Route a notification (returns instructions for the agent).
 * Does NOT send directly — provides structured routing decision.
 * The calling agent should use the appropriate tool.
 * 
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string|object} [opts.severity] - level name or score() result
 * @param {string} [opts.type] - event type for auto-scoring
 * @param {object} [opts.indicators] - for auto-scoring
 * @param {boolean} [opts.dryRun=false]
 * @returns {object} routing instructions
 */
function route(opts) {
  const { title = 'Alert', body = '', severity, type, indicators, dryRun = false } = opts;

  let result;
  if (typeof severity === 'object' && severity.level) {
    result = severity;
  } else if (typeof severity === 'string') {
    // Direct level override
    const lvl = LEVELS[severity.toUpperCase()];
    result = {
      level: lvl ? lvl.label : 'MEDIUM',
      score: lvl ? lvl.min : 50,
      channel: lvl ? lvl.channel : 'feishu_message',
      quietAdjusted: false,
    };
  } else {
    result = score({ type: type || 'custom', description: body, indicators: indicators || {} });
  }

  const instructions = {
    action: 'notify',
    title,
    body,
    severity: result.level,
    score: result.score,
    channel: result.channel,
    quietAdjusted: result.quietAdjusted || false,
    dryRun,
  };

  // Add channel-specific hints
  switch (result.channel) {
    case 'phone_call':
      instructions.hint = 'Use twilio-voice skill or voice_call tool. Phone: see USER.md';
      break;
    case 'feishu_urgent':
      instructions.hint = 'Send feishu message first, then use feishu_urgent tool on the message_id';
      break;
    case 'feishu_message':
      instructions.hint = 'Send via normal feishu message or reply in session';
      break;
  }

  return instructions;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0];

  function parseArgs(arr) {
    const result = {};
    for (const a of arr) {
      const m = a.match(/^--(\w[\w-]*)=(.+)$/);
      if (m) result[m[1]] = m[2];
      else if (a.startsWith('--')) result[a.slice(2)] = true;
    }
    return result;
  }

  if (cmd === 'score') {
    const p = parseArgs(args.slice(1));
    const indicators = {};
    if (p.pct) indicators.pctChange = parseFloat(p.pct);
    if (p.cvss) indicators.cvss = parseFloat(p.cvss);
    if (p.exploited) indicators.exploited = true;
    if (p['affects-us']) indicators.affectsUs = true;
    if (p.disk) indicators.diskPct = parseFloat(p.disk);
    if (p.mem) indicators.memPct = parseFloat(p.mem);
    if (p['service-down']) indicators.serviceDown = true;
    if (p.loss) indicators.lossUSD = parseFloat(p.loss);

    const r = score({ type: p.type || 'custom', description: p.desc || '', indicators });
    console.log(JSON.stringify(r, null, 2));
  } else if (cmd === 'send') {
    const p = parseArgs(args.slice(1));
    const indicators = {};
    if (p.pct) indicators.pctChange = parseFloat(p.pct);
    if (p.cvss) indicators.cvss = parseFloat(p.cvss);
    if (p.exploited) indicators.exploited = true;

    const r = route({
      title: p.title || 'Alert',
      body: p.desc || '',
      type: p.type || 'custom',
      indicators,
      dryRun: !!p['dry-run'],
    });
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log('notification-router — Smart notification routing');
    console.log('');
    console.log('Commands:');
    console.log('  score  --type=<market|security|system|custom> --desc="..." [--pct=N] [--cvss=N] [--exploited]');
    console.log('  send   --type=<type> --desc="..." --title="..." [--dry-run]');
  }
}

module.exports = { score, route, LEVELS, isQuietHours, scoreMarket, scoreSecurity, scoreSystem, scoreCustom };
