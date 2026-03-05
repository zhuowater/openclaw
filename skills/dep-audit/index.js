/**
 * dep-audit — Lightweight Node.js dependency auditor
 * 
 * Checks: npm audit (vulnerabilities), npm outdated, license scanning
 * Returns structured report with health score.
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const RISKY_LICENSES = new Set([
  'GPL-3.0', 'GPL-2.0', 'AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later',
  'GPL-3.0-only', 'GPL-3.0-or-later', 'GPL-2.0-only', 'GPL-2.0-or-later',
  'SSPL-1.0', 'BSL-1.1', 'EUPL-1.2', 'UNLICENSED', 'UNKNOWN'
]);

/**
 * Run a shell command and return stdout, swallowing errors gracefully
 */
function run(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    // npm audit exits non-zero when vulns found — that's expected
    return e.stdout || e.stderr || '';
  }
}

/**
 * Get vulnerability report via npm audit
 */
function getVulnerabilities(projectDir) {
  const raw = run('npm audit --json 2>/dev/null', projectDir);
  if (!raw.trim()) return { critical: 0, high: 0, moderate: 0, low: 0, total: 0, details: [] };

  try {
    const data = JSON.parse(raw);
    const vulns = data.metadata?.vulnerabilities || {};
    const details = [];

    if (data.vulnerabilities) {
      for (const [name, info] of Object.entries(data.vulnerabilities)) {
        details.push({
          package: name,
          severity: info.severity || 'unknown',
          title: info.title || info.name || name,
          fixAvailable: !!info.fixAvailable
        });
      }
    }

    return {
      critical: vulns.critical || 0,
      high: vulns.high || 0,
      moderate: vulns.moderate || 0,
      low: vulns.low || 0,
      total: (vulns.critical || 0) + (vulns.high || 0) + (vulns.moderate || 0) + (vulns.low || 0),
      details: details.slice(0, 20)  // cap at 20 for readability
    };
  } catch {
    return { critical: 0, high: 0, moderate: 0, low: 0, total: 0, details: [], parseError: true };
  }
}

/**
 * Get outdated packages via npm outdated
 */
function getOutdated(projectDir) {
  const raw = run('npm outdated --json 2>/dev/null', projectDir);
  if (!raw.trim() || raw.trim() === '{}') return [];

  try {
    const data = JSON.parse(raw);
    return Object.entries(data).map(([name, info]) => ({
      package: name,
      current: info.current || 'N/A',
      wanted: info.wanted || 'N/A',
      latest: info.latest || 'N/A',
      type: info.type || 'dependencies'
    })).slice(0, 50);
  } catch {
    return [];
  }
}

/**
 * Scan licenses from node_modules
 */
function getLicenses(projectDir) {
  const nmDir = path.join(projectDir, 'node_modules');
  if (!fs.existsSync(nmDir)) return { flagged: [], total: 0 };

  const flagged = [];
  let total = 0;

  try {
    const dirs = fs.readdirSync(nmDir);
    for (const dir of dirs) {
      if (dir.startsWith('.') || dir.startsWith('@')) {
        // Handle scoped packages
        if (dir.startsWith('@')) {
          const scopeDir = path.join(nmDir, dir);
          try {
            const scopedPkgs = fs.readdirSync(scopeDir);
            for (const sp of scopedPkgs) {
              total++;
              const pkgJson = path.join(scopeDir, sp, 'package.json');
              if (fs.existsSync(pkgJson)) {
                try {
                  const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
                  const license = typeof pkg.license === 'string' ? pkg.license : 
                    (pkg.license?.type || 'UNKNOWN');
                  if (RISKY_LICENSES.has(license)) {
                    flagged.push({ package: `${dir}/${sp}`, license });
                  }
                } catch { /* skip unreadable */ }
              }
            }
          } catch { /* skip */ }
        }
        continue;
      }

      total++;
      const pkgJson = path.join(nmDir, dir, 'package.json');
      if (fs.existsSync(pkgJson)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
          const license = typeof pkg.license === 'string' ? pkg.license : 
            (pkg.license?.type || 'UNKNOWN');
          if (RISKY_LICENSES.has(license)) {
            flagged.push({ package: dir, license });
          }
        } catch { /* skip unreadable */ }
      }
    }
  } catch { /* nmDir not readable */ }

  return { flagged: flagged.slice(0, 30), total };
}

/**
 * Calculate health score (0-100)
 */
function calculateScore(vulns, outdated, licenses) {
  let score = 100;

  // Vulnerabilities penalize heavily
  score -= vulns.critical * 20;
  score -= vulns.high * 10;
  score -= vulns.moderate * 3;
  score -= vulns.low * 1;

  // Outdated packages: minor penalty
  score -= Math.min(outdated.length * 2, 20);

  // Flagged licenses: moderate penalty
  score -= Math.min(licenses.flagged.length * 5, 15);

  return Math.max(0, Math.min(100, score));
}

/**
 * Main audit function
 * @param {string} projectDir - Path to project root (must have package.json)
 * @returns {object} Structured audit report
 */
async function audit(projectDir) {
  const dir = projectDir || process.cwd();
  const pkgPath = path.join(dir, 'package.json');

  if (!fs.existsSync(pkgPath)) {
    return { error: `No package.json found at ${dir}`, score: 0 };
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const vulns = getVulnerabilities(dir);
  const outdated = getOutdated(dir);
  const licenses = getLicenses(dir);
  const score = calculateScore(vulns, outdated, licenses);

  const report = {
    project: pkg.name || path.basename(dir),
    version: pkg.version || 'unknown',
    timestamp: new Date().toISOString(),
    score,
    grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F',
    vulnerabilities: vulns,
    outdated,
    licenses,
    recommendations: []
  };

  // Generate recommendations
  if (vulns.critical > 0) report.recommendations.push(`🔴 ${vulns.critical} critical vulnerabilities — run \`npm audit fix --force\``);
  if (vulns.high > 0) report.recommendations.push(`🟠 ${vulns.high} high-severity vulnerabilities — review and patch`);
  if (outdated.length > 10) report.recommendations.push(`📦 ${outdated.length} outdated packages — consider \`npm update\``);
  if (licenses.flagged.length > 0) report.recommendations.push(`⚖️ ${licenses.flagged.length} packages with restrictive licenses — review compliance`);
  if (score >= 90) report.recommendations.push('✅ Dependencies are in great shape!');

  return report;
}

/**
 * Format report as human-readable text
 */
function formatReport(report) {
  if (report.error) return `❌ Error: ${report.error}`;

  const lines = [
    `📋 Dependency Audit: ${report.project}@${report.version}`,
    `   Score: ${report.score}/100 (${report.grade})`,
    `   Time: ${report.timestamp}`,
    '',
    `🛡️ Vulnerabilities: ${report.vulnerabilities.total} total`,
    `   Critical: ${report.vulnerabilities.critical} | High: ${report.vulnerabilities.high} | Moderate: ${report.vulnerabilities.moderate} | Low: ${report.vulnerabilities.low}`,
  ];

  if (report.vulnerabilities.details.length > 0) {
    lines.push('');
    for (const v of report.vulnerabilities.details.slice(0, 10)) {
      lines.push(`   • [${v.severity.toUpperCase()}] ${v.package}${v.fixAvailable ? ' (fix available)' : ''}`);
    }
  }

  lines.push('', `📦 Outdated: ${report.outdated.length} packages`);
  if (report.outdated.length > 0) {
    for (const o of report.outdated.slice(0, 10)) {
      lines.push(`   • ${o.package}: ${o.current} → ${o.latest}`);
    }
    if (report.outdated.length > 10) lines.push(`   ... and ${report.outdated.length - 10} more`);
  }

  lines.push('', `⚖️ Licenses: ${licenses(report)} flagged of ${report.licenses.total} scanned`);
  if (report.licenses.flagged.length > 0) {
    for (const l of report.licenses.flagged.slice(0, 5)) {
      lines.push(`   • ${l.package} — ${l.license}`);
    }
  }

  if (report.recommendations.length > 0) {
    lines.push('', '💡 Recommendations:');
    for (const r of report.recommendations) lines.push(`   ${r}`);
  }

  return lines.join('\n');
}

function licenses(report) {
  return report.licenses.flagged.length;
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const dir = args.filter(a => a !== '--json')[0] || '/root/openclaw';

  audit(dir).then(report => {
    if (jsonMode) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatReport(report));
    }
  }).catch(err => {
    console.error('Audit failed:', err.message);
    process.exit(1);
  });
}

module.exports = { audit, formatReport };
