#!/usr/bin/env node
/**
 * Todo Manager - Sync code TODOs/FIXMEs to task system
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Extract TODO/FIXME comments from source code
 * @param {string} filePath - Path to source file
 * @returns {Array} - Array of { file, line, text, type }
 */
function extractTodos(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const todos = [];
  
  lines.forEach((line, idx) => {
    const todoMatch = line.match(/\/\/\s*(TODO|FIXME)[:：]?\s*(.+)/i);
    if (todoMatch) {
      todos.push({
        file: filePath,
        line: idx + 1,
        type: todoMatch[1].toUpperCase(),
        text: todoMatch[2].trim()
      });
    }
  });
  
  return todos;
}

/**
 * Scan directory for code TODOs
 * @param {string} dirPath - Directory to scan
 * @param {Array} extensions - File extensions to include
 * @returns {Array} - All TODOs found
 */
function scanDirectory(dirPath, extensions = ['.js', '.ts', '.py', '.sh', '.md']) {
  const allTodos = [];
  
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      // Skip node_modules, .git, etc
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build', '.venv'].includes(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          try {
            const todos = extractTodos(fullPath);
            allTodos.push(...todos);
          } catch (err) {
            // Skip files that can't be read
          }
        }
      }
    }
  }
  
  walk(dirPath);
  return allTodos;
}

/**
 * Save TODOs to JSON file
 * @param {Array} todos - Array of TODOs
 * @param {string} outputPath - Path to output file
 */
function saveTodos(todos, outputPath) {
  const data = {
    generated: new Date().toISOString(),
    count: todos.length,
    todos: todos
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
}

/**
 * Generate Markdown report
 * @param {Array} todos - Array of TODOs
 * @returns {string} - Markdown formatted report
 */
function generateMarkdownReport(todos) {
  let md = `# Code TODOs Report\n\n`;
  md += `Generated: ${new Date().toISOString()}\n`;
  md += `Total: ${todos.length} items\n\n`;
  
  // Group by type
  const byType = todos.reduce((acc, todo) => {
    if (!acc[todo.type]) acc[todo.type] = [];
    acc[todo.type].push(todo);
    return acc;
  }, {});
  
  for (const [type, items] of Object.entries(byType)) {
    md += `## ${type} (${items.length})\n\n`;
    items.forEach(item => {
      const relPath = item.file.replace(process.cwd() + '/', '');
      md += `- **${relPath}:${item.line}** — ${item.text}\n`;
    });
    md += '\n';
  }
  
  return md;
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);
  const scanPath = args[0] || process.cwd();
  
  console.log(`Scanning ${scanPath} for TODOs...`);
  
  const todos = scanDirectory(scanPath);
  
  console.log(`Found ${todos.length} TODOs`);
  
  // Save JSON
  const jsonPath = path.join(process.cwd(), 'todos.json');
  saveTodos(todos, jsonPath);
  console.log(`✓ Saved to ${jsonPath}`);
  
  // Generate Markdown
  const mdPath = path.join(process.cwd(), 'todos.md');
  const mdReport = generateMarkdownReport(todos);
  fs.writeFileSync(mdPath, mdReport);
  console.log(`✓ Report saved to ${mdPath}`);
  
  return todos;
}

// Export for programmatic use
module.exports = {
  extractTodos,
  scanDirectory,
  saveTodos,
  generateMarkdownReport,
  main
};

// Run if called directly
if (require.main === module) {
  main();
}
