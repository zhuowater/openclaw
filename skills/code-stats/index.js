const fs = require('fs');
const path = require('path');

/**
 * Analyze repository structure and code statistics
 * @param {string} rootPath - Root directory to analyze
 * @param {object} options - Analysis options
 * @returns {object} Statistics object
 */
function analyze(rootPath, options = {}) {
  const {
    excludeDirs = ['node_modules', '.git', 'dist', 'build'],
    maxDepth = 10
  } = options;

  const stats = {
    totalFiles: 0,
    totalLines: 0,
    languages: {},
    largestFiles: [],
    directories: 0,
    maxDepth: 0
  };

  function walk(dir, depth = 0) {
    if (depth > maxDepth) return;
    
    try {
      const items = fs.readdirSync(dir);
      stats.directories++;
      stats.maxDepth = Math.max(stats.maxDepth, depth);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        
        try {
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory()) {
            if (!excludeDirs.includes(item)) {
              walk(fullPath, depth + 1);
            }
          } else if (stat.isFile()) {
            stats.totalFiles++;
            
            const ext = path.extname(item).slice(1) || 'no-ext';
            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n').length;
            
            stats.totalLines += lines;
            stats.languages[ext] = (stats.languages[ext] || 0) + lines;
            
            stats.largestFiles.push({
              path: fullPath.replace(rootPath, '.'),
              lines,
              ext
            });
          }
        } catch (err) {
          // Skip permission errors
        }
      }
    } catch (err) {
      // Skip unreadable directories
    }
  }

  walk(rootPath);
  
  // Sort and limit largest files
  stats.largestFiles.sort((a, b) => b.lines - a.lines);
  stats.largestFiles = stats.largestFiles.slice(0, 20);
  
  return stats;
}

/**
 * Format statistics for human reading
 */
function format(stats) {
  const lines = [];
  
  lines.push('## Code Statistics\n');
  lines.push(`- **Total files**: ${stats.totalFiles}`);
  lines.push(`- **Total lines**: ${stats.totalLines.toLocaleString()}`);
  lines.push(`- **Directories**: ${stats.directories}`);
  lines.push(`- **Max depth**: ${stats.maxDepth}\n`);
  
  lines.push('### Languages (by lines)');
  const sortedLangs = Object.entries(stats.languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  for (const [lang, count] of sortedLangs) {
    const pct = ((count / stats.totalLines) * 100).toFixed(1);
    lines.push(`- ${lang}: ${count.toLocaleString()} (${pct}%)`);
  }
  
  lines.push('\n### Largest Files');
  for (const file of stats.largestFiles.slice(0, 10)) {
    lines.push(`- ${file.path}: ${file.lines} lines (${file.ext})`);
  }
  
  return lines.join('\n');
}

module.exports = { analyze, format };
