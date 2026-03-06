#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const path = require('path');

// --- Configuration ---
const COMMIT_TYPES = {
  feat:     { label: 'feat',     zh: '新功能', priority: 10 },
  fix:      { label: 'fix',      zh: '修复',   priority: 9 },
  refactor: { label: 'refactor', zh: '重构',   priority: 7 },
  perf:     { label: 'perf',     zh: '性能',   priority: 8 },
  docs:     { label: 'docs',     zh: '文档',   priority: 5 },
  style:    { label: 'style',    zh: '样式',   priority: 3 },
  test:     { label: 'test',     zh: '测试',   priority: 6 },
  chore:    { label: 'chore',    zh: '杂项',   priority: 4 },
  ci:       { label: 'ci',       zh: 'CI',     priority: 2 },
};

const MAX_SUBJECT_LEN = 72;

// --- Helpers ---

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { encoding: 'utf-8', maxBuffer: 1024 * 1024 }).trim();
  } catch (e) {
    return '';
  }
}

function getStagedDiff() {
  return git('diff --staged --stat') || git('diff --cached --stat');
}

function getStagedDiffFull() {
  return git('diff --staged') || git('diff --cached');
}

function getStagedFiles() {
  const raw = git('diff --staged --name-status') || git('diff --cached --name-status');
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(line => {
    const [status, ...pathParts] = line.split('\t');
    const filePath = pathParts.join('\t');
    return { status: status.charAt(0), path: filePath };
  });
}

// --- Analysis ---

function detectScope(files) {
  // Extract common scope from file paths
  const scopes = new Set();
  for (const f of files) {
    const parts = f.path.split('/');
    if (parts[0] === 'skills' && parts.length >= 2) {
      scopes.add(parts[1]);
    } else if (parts[0] === 'memory') {
      scopes.add('memory');
    } else if (parts[0] === 'scripts') {
      scopes.add('scripts');
    } else if (['MEMORY.md', 'SOUL.md', 'AGENTS.md', 'IDENTITY.md', 'USER.md', 'HEARTBEAT.md'].includes(parts[0])) {
      scopes.add('core');
    } else if (parts[0] === 'src') {
      scopes.add(parts.length >= 2 ? parts[1] : 'src');
    }
  }

  if (scopes.size === 0) return '';
  if (scopes.size === 1) return [...scopes][0];
  if (scopes.size <= 3) return [...scopes].join(',');
  return 'multi';
}

function detectType(files, diffContent, forceType) {
  if (forceType && COMMIT_TYPES[forceType]) return forceType;

  const stats = { added: 0, modified: 0, deleted: 0, renamed: 0 };
  for (const f of files) {
    if (f.status === 'A') stats.added++;
    else if (f.status === 'M') stats.modified++;
    else if (f.status === 'D') stats.deleted++;
    else if (f.status.startsWith('R')) stats.renamed++;
  }

  // Check for specific patterns in file paths
  const allPaths = files.map(f => f.path).join(' ');
  const isDocsOnly = files.every(f =>
    f.path.endsWith('.md') || f.path.endsWith('.txt') || f.path.endsWith('.rst')
  );
  const hasTests = files.some(f =>
    f.path.includes('test') || f.path.includes('spec') || f.path.includes('__tests__')
  );
  const isCI = files.every(f =>
    f.path.includes('.github/') || f.path.includes('Dockerfile') ||
    f.path.includes('.gitlab-ci') || f.path.includes('Jenkinsfile')
  );
  const isConfig = files.every(f =>
    f.path.endsWith('.json') || f.path.endsWith('.yml') || f.path.endsWith('.yaml') ||
    f.path.endsWith('.toml') || f.path.endsWith('.env')
  );

  // Check diff content for fix patterns
  const diffLower = (diffContent || '').toLowerCase();
  const hasFixPatterns = /\bfix(e[sd])?\b|\bbug\b|\berror\b|\bcrash\b|\bbroken\b|\bpatch\b/.test(diffLower);
  const hasPerfPatterns = /\bperformance\b|\boptimize\b|\bcache\b|\bfaster\b|\bspeed\b/.test(diffLower);

  if (isCI) return 'ci';
  if (isDocsOnly) return 'docs';
  if (hasTests && files.every(f => f.path.includes('test') || f.path.includes('spec'))) return 'test';
  if (stats.added > 0 && stats.added >= stats.modified) return 'feat';
  if (hasFixPatterns && stats.modified > 0) return 'fix';
  if (hasPerfPatterns) return 'perf';
  if (stats.deleted > stats.added && stats.deleted > stats.modified) return 'refactor';
  if (stats.modified > 0 && stats.added === 0) {
    return isConfig ? 'chore' : 'refactor';
  }
  return 'chore';
}

function generateSubject(type, files, lang) {
  const fileCount = files.length;
  const added = files.filter(f => f.status === 'A');
  const modified = files.filter(f => f.status === 'M');
  const deleted = files.filter(f => f.status === 'D');

  if (lang === 'zh') {
    return generateSubjectZH(type, files, added, modified, deleted, fileCount);
  }

  // English
  if (type === 'feat' && added.length > 0) {
    if (added.length === 1) {
      const name = path.basename(added[0].path, path.extname(added[0].path));
      return `add ${name}`;
    }
    return `add ${added.length} new files`;
  }
  if (type === 'fix' && modified.length > 0) {
    if (modified.length === 1) {
      return `fix issue in ${path.basename(modified[0].path)}`;
    }
    return `fix issues across ${modified.length} files`;
  }
  if (type === 'docs') {
    if (fileCount === 1) return `update ${path.basename(files[0].path)}`;
    return `update ${fileCount} docs`;
  }
  if (type === 'refactor' && deleted.length > 0) {
    return `remove ${deleted.length} file${deleted.length > 1 ? 's' : ''}`;
  }

  if (fileCount === 1) {
    return `update ${path.basename(files[0].path)}`;
  }
  return `update ${fileCount} files`;
}

function generateSubjectZH(type, files, added, modified, deleted, fileCount) {
  const typeLabel = COMMIT_TYPES[type]?.zh || type;

  if (type === 'feat' && added.length > 0) {
    if (added.length === 1) {
      const name = path.basename(added[0].path, path.extname(added[0].path));
      return `添加 ${name}`;
    }
    return `添加 ${added.length} 个新文件`;
  }
  if (type === 'fix') {
    if (modified.length === 1) return `修复 ${path.basename(modified[0].path)} 中的问题`;
    return `修复 ${modified.length} 个文件中的问题`;
  }
  if (type === 'docs') {
    if (fileCount === 1) return `更新 ${path.basename(files[0].path)}`;
    return `更新 ${fileCount} 个文档`;
  }

  if (fileCount === 1) return `更新 ${path.basename(files[0].path)}`;
  return `更新 ${fileCount} 个文件`;
}

function generateBody(files) {
  const lines = [];
  for (const f of files) {
    const statusMap = { A: '+ (new)', M: '~ (modified)', D: '- (deleted)', R: '→ (renamed)' };
    const label = statusMap[f.status] || f.status;
    lines.push(`  ${label} ${f.path}`);
  }
  return lines.join('\n');
}

function detectBreakingChange(diffContent) {
  if (!diffContent) return false;
  // Only detect actual API/export removals — not string mentions
  const removedLines = diffContent.split('\n')
    .filter(l => /^-/.test(l) && !/^---/.test(l))
    .join('\n');

  const patterns = [
    /^-\s*(module\.)?exports\.\w+/m,      // Removed export
    /^-\s*export\s+(default|const|function|class)\b/m, // Removed ES export
  ];
  return patterns.some(p => p.test(removedLines));
}

// --- Main ---

async function generateCommitMessage(options = {}) {
  const {
    lang = 'en',
    forceType = null,
    includeBody = false,
    cwd = process.cwd(),
  } = options;

  const files = getStagedFiles();
  if (files.length === 0) {
    return { error: 'No staged changes found. Run `git add` first.' };
  }

  const diffContent = getStagedDiffFull();
  const type = detectType(files, diffContent, forceType);
  const scope = detectScope(files);
  const subject = generateSubject(type, files, lang);
  const breaking = detectBreakingChange(diffContent);

  // Build commit message
  let header = type;
  if (scope) header += `(${scope})`;
  if (breaking) header += '!';
  header += `: ${subject}`;

  // Truncate if too long
  if (header.length > MAX_SUBJECT_LEN) {
    header = header.slice(0, MAX_SUBJECT_LEN - 3) + '...';
  }

  const result = {
    type,
    scope: scope || null,
    subject,
    header,
    breaking,
    files: files.length,
    body: includeBody ? generateBody(files) : null,
  };

  // Full message
  let fullMessage = header;
  if (includeBody) {
    fullMessage += '\n\n' + generateBody(files);
  }
  if (breaking) {
    fullMessage += '\n\nBREAKING CHANGE: This commit includes breaking changes.';
  }

  result.message = fullMessage;
  return result;
}

// --- CLI ---

async function main() {
  const args = process.argv.slice(2);
  const flags = {
    commit: args.includes('--commit'),
    json: args.includes('--json'),
    body: args.includes('--body'),
    lang: 'en',
    type: null,
  };

  const langIdx = args.indexOf('--lang');
  if (langIdx >= 0 && args[langIdx + 1]) flags.lang = args[langIdx + 1];

  const typeIdx = args.indexOf('--type');
  if (typeIdx >= 0 && args[typeIdx + 1]) flags.type = args[typeIdx + 1];

  const result = await generateCommitMessage({
    lang: flags.lang,
    forceType: flags.type,
    includeBody: flags.body || flags.commit,
  });

  if (result.error) {
    console.error(`❌ ${result.error}`);
    process.exit(1);
  }

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (flags.commit) {
    console.log(`📝 ${result.header}`);
    try {
      // Write message to temp file to handle special chars
      const fs = require('fs');
      const tmpFile = `/tmp/smart-commit-msg-${Date.now()}.txt`;
      fs.writeFileSync(tmpFile, result.message);
      execSync(`git commit -F "${tmpFile}"`, { stdio: 'inherit' });
      fs.unlinkSync(tmpFile);
      console.log('✅ Committed successfully.');
    } catch (e) {
      console.error('❌ Commit failed:', e.message);
      process.exit(1);
    }
  } else {
    // Just print the generated message
    console.log(result.header);
    if (result.body) {
      console.log('');
      console.log(result.body);
    }
  }
}

// Exports for programmatic use
module.exports = { generateCommitMessage, detectType, detectScope, generateSubject };

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
