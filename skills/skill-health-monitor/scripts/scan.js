#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SKILLS_DIR = '/root/openclaw/skills';

/**
 * Check if a skill's index.js is loadable
 */
function checkLoadability(skillPath) {
  const indexPath = path.join(skillPath, 'index.js');
  if (!fs.existsSync(indexPath)) {
    return { loadable: false, reason: 'index.js not found' };
  }
  
  try {
    require(indexPath);
    return { loadable: true };
  } catch (err) {
    return { loadable: false, reason: err.message };
  }
}

/**
 * Check if SKILL.md exists and has valid YAML frontmatter
 */
function checkSkillMd(skillPath) {
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    return { valid: false, reason: 'SKILL.md not found' };
  }
  
  const content = fs.readFileSync(skillMdPath, 'utf8');
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]+?)\r?\n---/);
  
  if (!frontmatterMatch) {
    return { valid: false, reason: 'YAML frontmatter missing' };
  }
  
  const frontmatter = frontmatterMatch[1];
  if (!frontmatter.includes('name:') || !frontmatter.includes('description:')) {
    return { valid: false, reason: 'Missing required fields (name/description)' };
  }
  
  return { valid: true };
}

/**
 * Check if package.json exists and is valid
 */
function checkPackageJson(skillPath) {
  const pkgPath = path.join(skillPath, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return { valid: false, reason: 'package.json not found' };
  }
  
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (!pkg.name || !pkg.version) {
      return { valid: false, reason: 'Missing name or version' };
    }
    return { valid: true, data: pkg };
  } catch (err) {
    return { valid: false, reason: 'Invalid JSON' };
  }
}

/**
 * Classify skill type: 'code' (has index.js), 'doc-only' (SKILL.md only), or 'empty'
 */
function classifySkill(skillPath) {
  const hasIndex = fs.existsSync(path.join(skillPath, 'index.js'));
  const hasSkillMd = fs.existsSync(path.join(skillPath, 'SKILL.md'));
  const hasScripts = fs.existsSync(path.join(skillPath, 'scripts'));
  if (hasIndex) return 'code';
  if (hasSkillMd || hasScripts) return 'doc-only';
  return 'empty';
}

/**
 * Check SKILL.md content quality (word count, section structure)
 */
function checkSkillMdQuality(skillPath) {
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return null;
  const content = fs.readFileSync(skillMdPath, 'utf8');
  const bodyStart = content.indexOf('---', 4);
  const body = bodyStart > 0 ? content.slice(bodyStart + 3).trim() : content;
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  const lineCount = body.split('\n').length;
  const hasHeaders = /^##?\s/m.test(body);
  const hasCodeBlock = /```/.test(body);
  const warnings = [];
  if (wordCount < 20) warnings.push('Very short SKILL.md body (< 20 words)');
  if (lineCount > 500) warnings.push('SKILL.md exceeds 500 lines (protocol recommends concise docs)');
  if (!hasHeaders && wordCount > 50) warnings.push('No section headers in SKILL.md');
  return { wordCount, lineCount, hasHeaders, hasCodeBlock, warnings };
}

/**
 * Scan a single skill
 */
function scanSkill(skillName, skillPath) {
  const skillType = classifySkill(skillPath);
  const result = {
    name: skillName,
    path: skillPath,
    type: skillType,
    healthy: true,
    issues: [],
    warnings: []
  };

  // All skills must have SKILL.md
  const skillMdCheck = checkSkillMd(skillPath);
  if (!skillMdCheck.valid) {
    // Missing SKILL.md is an issue for all types
    if (skillType === 'empty') {
      result.healthy = false;
      result.issues.push(`Empty skill directory (no SKILL.md, no index.js)`);
    } else {
      result.issues.push(`SKILL.md: ${skillMdCheck.reason}`);
      // For doc-only, missing SKILL.md is critical; for code, it's a warning
      if (skillType === 'doc-only') result.healthy = false;
      else result.warnings.push(`SKILL.md: ${skillMdCheck.reason}`);
    }
  }

  // SKILL.md quality check
  const quality = checkSkillMdQuality(skillPath);
  if (quality && quality.warnings.length > 0) {
    result.warnings.push(...quality.warnings);
  }

  // Code skills must be loadable and have package.json
  if (skillType === 'code') {
    const loadCheck = checkLoadability(skillPath);
    if (!loadCheck.loadable) {
      result.healthy = false;
      result.issues.push(`Loadability: ${loadCheck.reason}`);
    }

    const pkgCheck = checkPackageJson(skillPath);
    if (!pkgCheck.valid) {
      result.warnings.push(`package.json: ${pkgCheck.reason}`);
    }
  }

  return result;
}

/**
 * Scan all skills in skills/ directory
 */
function scanAllSkills() {
  if (!fs.existsSync(SKILLS_DIR)) {
    return { error: 'skills/ directory not found' };
  }
  
  const skills = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(name => {
      // Exclude current skill's own subdirectories
      const skillPath = path.join(SKILLS_DIR, name);
      return fs.existsSync(path.join(skillPath, 'SKILL.md')) || fs.existsSync(path.join(skillPath, 'index.js'));
    });
  
  const results = skills.map(skillName => {
    const skillPath = path.join(SKILLS_DIR, skillName);
    return scanSkill(skillName, skillPath);
  });
  
  const healthy = results.filter(r => r.healthy);
  const broken = results.filter(r => !r.healthy);
  const withWarnings = results.filter(r => r.healthy && r.warnings && r.warnings.length > 0);
  const codeSkills = results.filter(r => r.type === 'code');
  const docOnlySkills = results.filter(r => r.type === 'doc-only');

  return {
    timestamp: new Date().toISOString(),
    total: results.length,
    healthy: healthy.length,
    broken: broken.length,
    withWarnings: withWarnings.length,
    byType: {
      code: codeSkills.length,
      docOnly: docOnlySkills.length,
      empty: results.filter(r => r.type === 'empty').length
    },
    details: {
      healthy: healthy.map(r => r.name),
      broken: broken.map(r => ({ name: r.name, type: r.type, issues: r.issues })),
      warnings: withWarnings.map(r => ({ name: r.name, warnings: r.warnings }))
    }
  };
}

// CLI entry point
if (require.main === module) {
  const report = scanAllSkills();
  console.log(JSON.stringify(report, null, 2));

  if (report.broken > 0) {
    console.error(`\n⚠️  ${report.broken} broken skills detected`);
  }
  if (report.withWarnings > 0) {
    console.error(`\n⚡ ${report.withWarnings} skills with warnings`);
  }
  console.log(`\n📊 ${report.byType.code} code | ${report.byType.docOnly} doc-only | ${report.total} total`);
  if (report.broken > 0) process.exit(1);
  else console.log(`✅ All ${report.healthy} skills are healthy`);
}

module.exports = { scanAllSkills, scanSkill, classifySkill, checkSkillMdQuality };
