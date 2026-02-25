#!/usr/bin/env node

const { checkLinks } = require('../index.js');
const path = require('path');

const WORKSPACE = '/root/openclaw';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node check.js <file-or-pattern...>');
    console.error('Examples:');
    console.error('  node check.js MEMORY.md');
    console.error('  node check.js memory/*.md analysis/*.md');
    console.error('  node check.js -r analysis/');
    process.exit(1);
  }

  // -r 递归选项
  let patterns = args;
  if (args[0] === '-r') {
    const dir = args[1] || '.';
    patterns = [path.join(dir, '**/*.md')];
  }

  console.log('Checking links in:', patterns.join(', '));
  console.log('');

  const results = await checkLinks(patterns);

  // 按文件分组
  const byFile = {};
  results.forEach((r) => {
    if (!byFile[r.file]) byFile[r.file] = [];
    byFile[r.file].push(r);
  });

  let totalOk = 0;
  let totalBroken = 0;

  Object.entries(byFile).forEach(([file, links]) => {
    const broken = links.filter((l) => !l.ok);
    const ok = links.filter((l) => l.ok);

    totalOk += ok.length;
    totalBroken += broken.length;

    if (broken.length === 0) {
      console.log(`✓ ${file}`);
    } else {
      console.log(`✗ ${file} (${broken.length} broken)`);
    }

    broken.forEach((l) => {
      const reason = l.reason || `${l.status}`;
      console.log(`  ✗ ${l.url} - ${reason} (line ${l.line})`);
    });

    if (broken.length > 0) console.log('');
  });

  console.log(`\nSummary: ${totalOk} OK, ${totalBroken} BROKEN`);

  if (totalBroken > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
