#!/usr/bin/env node
/**
 * Local Vector Store - Main Entry
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCRIPT_PATH = join(__dirname, 'scripts', 'vectorstore.py');

export async function search(query, topK = 5) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [SCRIPT_PATH, 'search', query]);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Exit code ${code}`));
      } else {
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse output: ${stdout}`));
        }
      }
    });
  });
}

export async function buildIndex() {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [SCRIPT_PATH, 'index']);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Exit code ${code}`));
      } else {
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse output: ${stdout}`));
        }
      }
    });
  });
}

// CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  
  if (command === 'search') {
    const query = process.argv.slice(3).join(' ');
    search(query).then(result => {
      console.log(JSON.stringify(result, null, 2));
    }).catch(err => {
      console.error(err.message);
      process.exit(1);
    });
  } else if (command === 'index') {
    buildIndex().then(result => {
      console.log(JSON.stringify(result, null, 2));
    }).catch(err => {
      console.error(err.message);
      process.exit(1);
    });
  } else {
    console.error('Usage: node index.js <search|index> [query]');
    process.exit(1);
  }
}
