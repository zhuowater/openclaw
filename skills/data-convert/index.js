/**
 * data-convert — Convert between CSV, JSON, TSV, and Markdown table formats
 *
 * Zero dependencies. Handles quoted CSV fields, auto-detection, streaming.
 */

'use strict';

// ─── CSV Parser (RFC 4180 compliant) ───

function parseCSV(text, delimiter = ',') {
  const rows = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const row = [];
    while (i < len) {
      let value = '';
      // Skip leading whitespace (but not within quotes)
      if (text[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        while (i < len) {
          if (text[i] === '"') {
            if (i + 1 < len && text[i + 1] === '"') {
              value += '"';
              i += 2;
            } else {
              i++; // skip closing quote
              break;
            }
          } else {
            value += text[i];
            i++;
          }
        }
        // Skip to delimiter or end of line
        while (i < len && text[i] !== delimiter && text[i] !== '\n' && text[i] !== '\r') {
          i++;
        }
      } else {
        // Unquoted field
        while (i < len && text[i] !== delimiter && text[i] !== '\n' && text[i] !== '\r') {
          value += text[i];
          i++;
        }
      }
      row.push(value);
      if (i < len && text[i] === delimiter) {
        i++; // skip delimiter
        continue;
      }
      break;
    }
    // Skip line endings
    if (i < len && text[i] === '\r') i++;
    if (i < len && text[i] === '\n') i++;
    if (row.length > 0 && !(row.length === 1 && row[0] === '')) {
      rows.push(row);
    }
  }
  return rows;
}

function csvRowsToObjects(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = row[idx] !== undefined ? row[idx] : '';
    });
    return obj;
  });
}

// ─── Format Detection ───

function detectFormat(text) {
  const trimmed = text.trim();
  // JSON array or object
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try { JSON.parse(trimmed); return 'json'; } catch (_) {}
  }
  // Markdown table
  if (/^\|.+\|/.test(trimmed) && /\|[\s-:]+\|/.test(trimmed)) {
    return 'markdown';
  }
  // TSV vs CSV: count tabs vs commas in first line
  const firstLine = trimmed.split('\n')[0];
  const tabs = (firstLine.match(/\t/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  if (tabs > 0 && tabs >= commas) return 'tsv';
  return 'csv';
}

// ─── Parsers ───

function parseInput(text, format) {
  switch (format) {
    case 'csv': return csvRowsToObjects(parseCSV(text, ','));
    case 'tsv': return csvRowsToObjects(parseCSV(text, '\t'));
    case 'json': return parseJSON(text);
    case 'markdown': return parseMarkdown(text);
    default: throw new Error(`Unknown input format: ${format}`);
  }
}

function parseJSON(text) {
  const data = JSON.parse(text.trim());
  if (Array.isArray(data)) {
    return data.map(item => {
      if (typeof item === 'object' && item !== null) return item;
      return { value: String(item) };
    });
  }
  if (typeof data === 'object' && data !== null) {
    return [data];
  }
  return [{ value: String(data) }];
}

function parseMarkdown(text) {
  const lines = text.trim().split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 2) return [];

  const splitRow = (line) =>
    line.split('|').slice(1, -1).map(c => c.trim());

  const headers = splitRow(lines[0]);
  // Skip separator line (line[1])
  const dataLines = lines.slice(2);

  return dataLines.map(line => {
    const cells = splitRow(line);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] !== undefined ? cells[idx] : '';
    });
    return obj;
  });
}

// ─── Formatters ───

function getHeaders(objects) {
  const seen = new Set();
  const headers = [];
  for (const obj of objects) {
    for (const key of Object.keys(obj)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  return headers;
}

function escapeCSVField(value, delimiter = ',') {
  const str = String(value === null || value === undefined ? '' : value);
  if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function toCSV(objects) {
  if (!objects.length) return '';
  const headers = getHeaders(objects);
  const lines = [headers.map(h => escapeCSVField(h)).join(',')];
  for (const obj of objects) {
    lines.push(headers.map(h => escapeCSVField(obj[h])).join(','));
  }
  return lines.join('\n');
}

function toTSV(objects) {
  if (!objects.length) return '';
  const headers = getHeaders(objects);
  const lines = [headers.join('\t')];
  for (const obj of objects) {
    lines.push(headers.map(h => {
      const v = obj[h];
      return String(v === null || v === undefined ? '' : v).replace(/\t/g, ' ');
    }).join('\t'));
  }
  return lines.join('\n');
}

function toJSON(objects) {
  return JSON.stringify(objects, null, 2);
}

function toMarkdown(objects) {
  if (!objects.length) return '';
  const headers = getHeaders(objects);
  const headerRow = '| ' + headers.join(' | ') + ' |';
  const sepRow = '| ' + headers.map(() => '---').join(' | ') + ' |';
  const dataRows = objects.map(obj =>
    '| ' + headers.map(h => {
      const v = obj[h];
      return String(v === null || v === undefined ? '' : v).replace(/\|/g, '\\|');
    }).join(' | ') + ' |'
  );
  return [headerRow, sepRow, ...dataRows].join('\n');
}

// ─── High-level convert ───

function convert(text, options = {}) {
  const from = options.from || detectFormat(text);
  const to = options.to || 'json';
  if (from === to) return text;
  const objects = parseInput(text, from);
  switch (to) {
    case 'csv': return toCSV(objects);
    case 'tsv': return toTSV(objects);
    case 'json': return toJSON(objects);
    case 'markdown': return toMarkdown(objects);
    default: throw new Error(`Unknown output format: ${to}`);
  }
}

// ─── CLI ───

function printUsage() {
  console.log(`Usage: node index.js [options]

Options:
  --from <format>    Input format: csv|tsv|json|markdown (auto-detect if omitted)
  --to <format>      Output format: csv|tsv|json|markdown (required)
  --input <file>     Input file (default: stdin)
  --output <file>    Output file (default: stdout)
  --help             Show this help

Examples:
  echo "a,b\\n1,2" | node index.js --to json
  node index.js --from csv --to markdown --input data.csv
`);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--from': opts.from = args[++i]; break;
      case '--to': opts.to = args[++i]; break;
      case '--input': opts.input = args[++i]; break;
      case '--output': opts.output = args[++i]; break;
      case '--help': printUsage(); process.exit(0);
      default:
        console.error(`Unknown option: ${args[i]}`);
        printUsage();
        process.exit(1);
    }
  }

  if (!opts.to) {
    console.error('Error: --to <format> is required');
    printUsage();
    process.exit(1);
  }

  const fs = require('fs');
  let text;
  if (opts.input) {
    text = fs.readFileSync(opts.input, 'utf8');
  } else {
    text = await readStdin();
  }

  if (!opts.from) {
    opts.from = detectFormat(text);
  }

  const result = convert(text, { from: opts.from, to: opts.to });

  if (opts.output) {
    fs.writeFileSync(opts.output, result, 'utf8');
    console.error(`Written to ${opts.output}`);
  } else {
    process.stdout.write(result + '\n');
  }
}

// ─── Exports ───

module.exports = {
  convert,
  detectFormat,
  parseCSV: (text, delim) => csvRowsToObjects(parseCSV(text, delim)),
  parseJSON,
  parseMarkdown,
  toCSV,
  toTSV,
  toJSON,
  toMarkdown,
  getHeaders,
};

// Run CLI if invoked directly
if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
