const fs = require('fs').promises;
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execFileAsync = promisify(execFile);

/**
 * Git Status - Get repository status without spawning shell
 * @param {string} cwd - Working directory (default: /root/openclaw)
 * @returns {Promise<Object>} - { clean, staged, modified, untracked }
 */
async function gitStatus(cwd = '/root/openclaw') {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd });
    const lines = stdout.trim().split('\n').filter(Boolean);
    
    const status = {
      clean: lines.length === 0,
      staged: [],
      modified: [],
      untracked: []
    };
    
    for (const line of lines) {
      const code = line.substring(0, 2);
      const file = line.substring(3);
      
      if (code[0] !== ' ' && code[0] !== '?') status.staged.push(file);
      if (code[1] === 'M' || code[0] === 'M') status.modified.push(file);
      if (code === '??') status.untracked.push(file);
    }
    
    return status;
  } catch (err) {
    throw new Error(`gitStatus failed: ${err.message}`);
  }
}

/**
 * Git Log - Get recent commits
 * @param {number} count - Number of commits (default: 5)
 * @param {string} cwd - Working directory
 * @returns {Promise<Array>} - Array of { hash, message, author, date }
 */
async function gitLog(count = 5, cwd = '/root/openclaw') {
  try {
    const { stdout } = await execFileAsync('git', [
      'log',
      `--oneline`,
      `-n`, String(count),
      '--pretty=format:%H|%s|%an|%ai'
    ], { cwd });
    
    return stdout.trim().split('\n').map(line => {
      const [hash, message, author, date] = line.split('|');
      return { hash: hash.substring(0, 7), message, author, date };
    });
  } catch (err) {
    throw new Error(`gitLog failed: ${err.message}`);
  }
}

/**
 * Git Diff Stats - Get diff summary
 * @param {string} cwd - Working directory
 * @returns {Promise<Object>} - { files, insertions, deletions }
 */
async function gitDiff(cwd = '/root/openclaw') {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--stat'], { cwd });
    const match = stdout.match(/(\d+) files? changed(?:, (\d+) insertions?)?(?:, (\d+) deletions?)?/);
    
    if (!match) return { files: 0, insertions: 0, deletions: 0 };
    
    return {
      files: parseInt(match[1]) || 0,
      insertions: parseInt(match[2]) || 0,
      deletions: parseInt(match[3]) || 0
    };
  } catch (err) {
    throw new Error(`gitDiff failed: ${err.message}`);
  }
}

/**
 * File Exists - Check if file exists
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>}
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Directory Size - Get total size of directory
 * @param {string} dirPath - Directory path
 * @returns {Promise<Object>} - { bytes, human }
 */
async function dirSize(dirPath) {
  try {
    const { stdout } = await execFileAsync('du', ['-sb', dirPath]);
    const bytes = parseInt(stdout.split('\t')[0]);
    
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return {
      bytes,
      human: `${size.toFixed(1)}${units[unitIndex]}`
    };
  } catch (err) {
    throw new Error(`dirSize failed: ${err.message}`);
  }
}

/**
 * Find Files - Find files matching pattern
 * @param {string} dir - Directory to search
 * @param {string} pattern - Glob pattern (e.g., "*.js")
 * @param {Object} options - { limit: number }
 * @returns {Promise<Array<string>>}
 */
async function findFiles(dir, pattern, options = {}) {
  const { limit = 100 } = options;
  
  try {
    const { stdout } = await execFileAsync('find', [
      dir,
      '-name', pattern,
      '-type', 'f',
      '-print0'
    ], { maxBuffer: 1024 * 1024 });
    
    const files = stdout.split('\0').filter(Boolean);
    return files.slice(0, limit);
  } catch (err) {
    throw new Error(`findFiles failed: ${err.message}`);
  }
}

/**
 * Read Lines - Read specific lines from file
 * @param {string} filePath - File to read
 * @param {Object} options - { start: number, count: number }
 * @returns {Promise<Array<string>>}
 */
async function readLines(filePath, options = {}) {
  const { start = 1, count = 10 } = options;
  
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    return lines.slice(start - 1, start - 1 + count);
  } catch (err) {
    throw new Error(`readLines failed: ${err.message}`);
  }
}

/**
 * Process Info - Get process information
 * @param {string} pattern - Process name pattern
 * @returns {Promise<Array>} - Array of { pid, cpu, mem, command }
 */
async function processInfo(pattern) {
  try {
    const { stdout } = await execFileAsync('ps', ['aux']);
    const lines = stdout.split('\n').slice(1); // Skip header
    
    const processes = [];
    for (const line of lines) {
      if (!line.includes(pattern)) continue;
      
      const parts = line.trim().split(/\s+/);
      if (parts.length < 11) continue;
      
      processes.push({
        pid: parseInt(parts[1]),
        cpu: parseFloat(parts[2]),
        mem: parseFloat(parts[3]),
        command: parts.slice(10).join(' ')
      });
    }
    
    return processes;
  } catch (err) {
    throw new Error(`processInfo failed: ${err.message}`);
  }
}

/**
 * Main entry point (for testing)
 */
async function main() {
  console.log('exec-optimizer loaded successfully');
  console.log('Available functions:', Object.keys(module.exports).filter(k => k !== 'main'));
}

module.exports = {
  gitStatus,
  gitLog,
  gitDiff,
  fileExists,
  dirSize,
  findFiles,
  readLines,
  processInfo,
  main
};
