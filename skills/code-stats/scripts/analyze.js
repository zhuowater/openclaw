#!/usr/bin/env node

const { analyze, format } = require('../index.js');

const targetPath = process.argv[2] || process.cwd();

console.log(`Analyzing: ${targetPath}\n`);

const stats = analyze(targetPath);
console.log(format(stats));
