#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const path = require('path');

// --- Security patterns ---
const SECURITY_PATTERNS = [
  { re: /(?:api[_-]?key|apikey|secret|password|passwd|token|auth[_-]?token|access[_-]?token|bearer)\s*[:=]\s*['"][^'"]{8,}/gi, severity: 'HIGH', category: 'secrets', msg: 'Possible hardcoded secret/token' },
  { re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g, severity: 'CRITICAL', category: 'secrets', msg: 'Private key in source code' },
  { re: /\beval\s*\(/g, severity: 'HIGH', category: 'injection', msg: 'eval() usage — potential code injection' },
  { re: /new\s+Function\s*\(/g, severity: 'HIGH', category: 'injection', msg: 'new Function() — potential code injection' },
  { re: /child_process.*exec\s*\([^)]*\+/g, severity: 'HIGH', category: 'injection', msg: 'exec() with string concatenation — command injection risk' },
  { re: /process\.env\.\w+/g, severity: 'INFO', category: 'env', msg: 'Environment variable reference (verify not leaking)' },
  { re: /rejectUnauthorized\s*:\s*false/g, severity: 'HIGH', category: 'tls', msg: 'TLS verification disabled' },
  { re: /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/g, severity: 'HIGH', category: 'tls', msg: 'TLS rejection disabled via env' },
  { re: /(?:SELECT|INSERT|UPDATE|DELETE)\s+.*\+\s*(?:req\.|params\.|query\.|body\.)/gi, severity: 'HIGH', category: 'sqli', msg: 'SQL query with string concatenation — injection risk' },
  { re: /\.innerHTML\s*=\s*[^'"`]/g, severity: 'MEDIUM', category: 'xss', msg: 'innerHTML assignment — XSS risk' },
  { re: /(?:0x[a-fA-F0-9]{40})/g, severity: 'INFO', category: 'crypto', msg: 'Ethereum address detected — verify intentional' },
];

// --- Code smell patterns ---
const SMELL_PATTERNS = [
  { re: /console\.\s*log\s*\(/g, severity: 'INFO', category: 'debug', msg: 'console.log left in code' },
  { re: /\/\/\s*TODO\b/gi, severity: 'INFO', category: 'todo', msg: 'TODO comment' },
  { re: /\/\/\s*FIXME\b/gi, severity: 'WARN', category: 'fixme', msg: 'FIXME comment — needs attention' },
  { re: /\/\/\s*HACK\b/gi, severity: 'WARN', category: 'hack', msg: 'HACK comment — technical debt' },
  { re: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/g, severity: 'WARN', category: 'error-handling', msg: 'Empty catch block — swallowed error' },
  { re: /\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/g, severity: 'WARN', category: 'error-handling', msg: 'Empty .catch() — swallowed promise error' },
];

const ALL_PATTERNS = [...SECURITY_PATTERNS, ...SMELL_PATTERNS];

/**
 * Get diff content from git
 */
function getDiff(repoPath, opts = {}) {
  const cwd = repoPath || process.cwd();
  try {
    let cmd;
    if (opts.last) {
      cmd = `git log -${opts.last} -p --no-color`;
    } else if (opts.unstaged) {
      cmd = 'git diff --no-color';
    } else {
      cmd = 'git diff --cached --no-color';
    }
    return execSync(cmd, { cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  } catch (e) {
    return '';
  }
}

/**
 * Parse unified diff into per-file hunks with added lines only
 */
function parseDiff(diffText) {
  const files = [];
  if (!diffText) return files;

  const fileParts = diffText.split(/^diff --git /m).filter(Boolean);
  for (const part of fileParts) {
    const headerMatch = part.match(/^a\/(.*?)\s+b\/(.*)/m);
    if (!headerMatch) continue;
    const filePath = headerMatch[2];
    
    // Only review added lines
    const addedLines = [];
    let currentLine = 0;
    for (const line of part.split('\n')) {
      const hunkMatch = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)/);
      if (hunkMatch) {
        currentLine = parseInt(hunkMatch[1], 10);
        continue;
      }
      if (line.startsWith('+') && !line.startsWith('+++')) {
        addedLines.push({ lineNo: currentLine, text: line.slice(1) });
        currentLine++;
      } else if (!line.startsWith('-')) {
        currentLine++;
      }
    }
    
    const totalAdded = addedLines.length;
    const removedCount = (part.match(/^\-(?!\-\-)/gm) || []).length;
    
    files.push({ path: filePath, addedLines, totalAdded, totalRemoved: removedCount });
  }
  return files;
}

/**
 * Scan files for pattern matches
 */
function scanFiles(files) {
  const issues = [];
  
  for (const file of files) {
    for (const line of file.addedLines) {
      for (const pattern of ALL_PATTERNS) {
        if (pattern.re.test(line.text)) {
          issues.push({
            severity: pattern.severity,
            category: pattern.category,
            file: file.path,
            line: line.lineNo,
            message: pattern.msg,
            snippet: line.text.trim().slice(0, 120),
          });
        }
        // Reset regex lastIndex
        pattern.re.lastIndex = 0;
      }
    }
  }
  
  return issues;
}

/**
 * Calculate risk score (0-100, higher = safer)
 */
function calculateScore(files, issues) {
  let score = 100;
  
  // Deductions by severity
  for (const issue of issues) {
    switch (issue.severity) {
      case 'CRITICAL': score -= 25; break;
      case 'HIGH': score -= 15; break;
      case 'MEDIUM': score -= 8; break;
      case 'WARN': score -= 3; break;
      case 'INFO': score -= 1; break;
    }
  }
  
  // Blast radius penalty (many files = more risk)
  const fileCount = files.length;
  if (fileCount > 20) score -= 15;
  else if (fileCount > 10) score -= 8;
  else if (fileCount > 5) score -= 3;
  
  // Large change penalty
  const totalAdded = files.reduce((s, f) => s + f.totalAdded, 0);
  if (totalAdded > 500) score -= 10;
  else if (totalAdded > 200) score -= 5;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Main review function
 */
function review(opts = {}) {
  const repoPath = opts.repoPath || '/root/openclaw';
  const diffText = getDiff(repoPath, opts);
  
  if (!diffText.trim()) {
    return {
      score: 100,
      riskLevel: 'NONE',
      files: [],
      issues: [],
      summary: 'No changes to review.',
      stats: { filesChanged: 0, linesAdded: 0, linesRemoved: 0 },
    };
  }
  
  const files = parseDiff(diffText);
  const issues = scanFiles(files);
  const score = calculateScore(files, issues);
  
  const stats = {
    filesChanged: files.length,
    linesAdded: files.reduce((s, f) => s + f.totalAdded, 0),
    linesRemoved: files.reduce((s, f) => s + f.totalRemoved, 0),
  };
  
  let riskLevel = 'LOW';
  if (score < 40) riskLevel = 'HIGH';
  else if (score < 70) riskLevel = 'MODERATE';
  else if (score < 90) riskLevel = 'LOW';
  else riskLevel = 'MINIMAL';
  
  const critCount = issues.filter(i => i.severity === 'CRITICAL').length;
  const highCount = issues.filter(i => i.severity === 'HIGH').length;
  const warnCount = issues.filter(i => i.severity === 'WARN' || i.severity === 'MEDIUM').length;
  const infoCount = issues.filter(i => i.severity === 'INFO').length;
  
  const summary = `${stats.filesChanged} files changed (+${stats.linesAdded} -${stats.linesRemoved}), ` +
    `Score: ${score}/100 (${riskLevel})` +
    (critCount ? `, ${critCount} CRITICAL` : '') +
    (highCount ? `, ${highCount} HIGH` : '') +
    (warnCount ? `, ${warnCount} WARN` : '') +
    (infoCount ? `, ${infoCount} INFO` : '');
  
  return { score, riskLevel, files: files.map(f => f.path), issues, summary, stats };
}

/**
 * Format report for terminal display
 */
function formatReport(result) {
  const lines = [];
  const w = 55;
  
  lines.push('┌' + '─'.repeat(w) + '┐');
  lines.push('│' + ` Commit Review: ${result.stats.filesChanged} files, +${result.stats.linesAdded} -${result.stats.linesRemoved}`.padEnd(w) + '│');
  lines.push('│' + ` Risk Score: ${result.score}/100 (${result.riskLevel})`.padEnd(w) + '│');
  lines.push('├' + '─'.repeat(w) + '┤');
  
  if (result.issues.length === 0) {
    lines.push('│' + ' ✓ No issues found'.padEnd(w) + '│');
  } else {
    // Group by severity
    const byFile = {};
    for (const issue of result.issues) {
      (byFile[issue.file] = byFile[issue.file] || []).push(issue);
    }
    
    for (const [file, fileIssues] of Object.entries(byFile)) {
      for (const issue of fileIssues) {
        const icon = issue.severity === 'CRITICAL' ? '✖' :
                     issue.severity === 'HIGH' ? '⚠' :
                     issue.severity === 'WARN' || issue.severity === 'MEDIUM' ? '⚡' : 'ℹ';
        const tag = issue.severity.padEnd(8);
        const loc = `${path.basename(file)}:${issue.line}`;
        const msg = issue.message;
        const line = ` ${icon} ${tag} ${loc.padEnd(20)} ${msg}`;
        lines.push('│' + line.slice(0, w).padEnd(w) + '│');
      }
    }
  }
  
  lines.push('└' + '─'.repeat(w) + '┘');
  return lines.join('\n');
}

// --- CLI ---
if (require.main === module) {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const unstaged = args.includes('--unstaged');
  const lastIdx = args.indexOf('--last');
  const last = lastIdx !== -1 ? parseInt(args[lastIdx + 1], 10) : null;
  const repoPath = args.find(a => !a.startsWith('-')) || '/root/openclaw';
  
  const result = review({ repoPath, unstaged, last });
  
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatReport(result));
  }
  
  // Exit code: non-zero if critical issues
  const hasCritical = result.issues.some(i => i.severity === 'CRITICAL');
  process.exit(hasCritical ? 1 : 0);
}

module.exports = { review, formatReport };
