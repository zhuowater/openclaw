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
  const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---/);
  
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
 * Scan a single skill
 */
function scanSkill(skillName, skillPath) {
  const result = {
    name: skillName,
    path: skillPath,
    healthy: true,
    issues: []
  };
  
  // Check structure
  const loadCheck = checkLoadability(skillPath);
  if (!loadCheck.loadable) {
    result.healthy = false;
    result.issues.push(`Loadability: ${loadCheck.reason}`);
  }
  
  const skillMdCheck = checkSkillMd(skillPath);
  if (!skillMdCheck.valid) {
    result.healthy = false;
    result.issues.push(`SKILL.md: ${skillMdCheck.reason}`);
  }
  
  const pkgCheck = checkPackageJson(skillPath);
  if (!pkgCheck.valid) {
    result.healthy = false;
    result.issues.push(`package.json: ${pkgCheck.reason}`);
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
  
  return {
    timestamp: new Date().toISOString(),
    total: results.length,
    healthy: healthy.length,
    broken: broken.length,
    details: {
      healthy: healthy.map(r => r.name),
      broken: broken.map(r => ({ name: r.name, issues: r.issues }))
    }
  };
}

// CLI entry point
if (require.main === module) {
  const report = scanAllSkills();
  console.log(JSON.stringify(report, null, 2));
  
  if (report.broken > 0) {
    console.error(`\n⚠️  ${report.broken} broken skills detected`);
    process.exit(1);
  } else {
    console.log(`\n✅ All ${report.healthy} skills are healthy`);
  }
}

module.exports = { scanAllSkills, scanSkill };
