/**
 * diagram-gen — Generate Mermaid diagrams from structured data
 *
 * Supports: flowchart, sequence, class, state, er, gantt, pie, gitgraph
 * Optionally renders to SVG/PNG via @mermaid-js/mermaid-cli
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Diagram Type Registry ──────────────────────────────────────────

const TYPES = {
  flowchart: { aliases: ['flowchart', 'flow', 'process'], generator: genFlowchart },
  sequence:  { aliases: ['sequence', 'seq', 'interaction'], generator: genSequence },
  class:     { aliases: ['class', 'uml'],                  generator: genClass },
  state:     { aliases: ['state', 'fsm'],                  generator: genState },
  er:        { aliases: ['er', 'entity', 'database'],       generator: genER },
  gantt:     { aliases: ['gantt', 'timeline', 'schedule'],  generator: genGantt },
  pie:       { aliases: ['pie', 'chart', 'distribution'],   generator: genPie },
  gitgraph:  { aliases: ['gitgraph', 'git', 'branch'],      generator: genGitGraph },
};

function resolveType(input) {
  const key = (input || '').toLowerCase().trim();
  for (const [type, def] of Object.entries(TYPES)) {
    if (type === key || def.aliases.includes(key)) return type;
  }
  return null;
}

// ─── Generators ─────────────────────────────────────────────────────

/**
 * Parse simple arrow notation: "A -> B -> C" or "A -> B; B -> C -> D"
 */
function parseArrowNotation(str) {
  const nodes = new Map();
  const edges = [];
  const segments = str.split(/[;\n]/).map(s => s.trim()).filter(Boolean);

  for (const seg of segments) {
    // Split by arrow tokens, extracting node names between arrows
    const parts = seg.split(/\s*-+>\s*/);
    const nodeIds = [];

    for (const part of parts) {
      const raw = (part || '').trim();
      if (!raw) continue;
      // Extract optional label: "NodeName|label|"
      const labelMatch = raw.match(/^(.*?)\|([^|]*)\|$/);
      const nodeName = labelMatch ? labelMatch[1].trim() : raw;
      if (!nodeName) continue;

      const id = nodeName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\u4e00-\u9fff]/g, '');
      if (!nodes.has(id)) nodes.set(id, nodeName);
      nodeIds.push(id);
    }

    for (let i = 0; i < nodeIds.length - 1; i++) {
      edges.push([nodeIds[i], nodeIds[i + 1], null]);
    }
  }

  return {
    nodes: Array.from(nodes.entries()).map(([id, label]) => ({ id, label })),
    edges,
  };
}

function genFlowchart(input) {
  let data;
  if (typeof input === 'string') {
    data = parseArrowNotation(input);
  } else {
    data = input;
  }

  const lines = ['flowchart TD'];
  const nodes = data.nodes || [];
  const edges = data.edges || [];

  // Declare nodes with labels
  for (const n of nodes) {
    const id = typeof n === 'string' ? n : n.id;
    const label = typeof n === 'string' ? n : (n.label || n.id);
    const shape = n.shape || 'rect';
    if (shape === 'diamond') {
      lines.push(`    ${id}{${label}}`);
    } else if (shape === 'round') {
      lines.push(`    ${id}(${label})`);
    } else if (shape === 'stadium') {
      lines.push(`    ${id}([${label}])`);
    } else {
      lines.push(`    ${id}[${label}]`);
    }
  }

  // Declare edges
  for (const e of edges) {
    const [from, to, label] = Array.isArray(e) ? e : [e.from, e.to, e.label];
    if (label) {
      lines.push(`    ${from} -->|${label}| ${to}`);
    } else {
      lines.push(`    ${from} --> ${to}`);
    }
  }

  return lines.join('\n');
}

function genSequence(input) {
  let data;
  if (typeof input === 'string') {
    try { data = JSON.parse(input); } catch { data = { raw: input }; }
  } else {
    data = input;
  }

  const lines = ['sequenceDiagram'];

  // Participants
  if (data.actors) {
    for (const a of data.actors) {
      lines.push(`    participant ${a}`);
    }
  }

  // Messages
  if (data.messages) {
    for (const msg of data.messages) {
      const [from, to, text, type] = msg;
      const arrow = type === 'dotted' ? '-->>' : '->>';
      lines.push(`    ${from}${arrow}${to}: ${text}`);
    }
  }

  // Notes
  if (data.notes) {
    for (const note of data.notes) {
      const [pos, actor, text] = note;
      lines.push(`    Note ${pos} ${actor}: ${text}`);
    }
  }

  return lines.join('\n');
}

function genClass(input) {
  let data;
  if (typeof input === 'string') {
    try { data = JSON.parse(input); } catch { return `classDiagram\n    ${input}`; }
  } else {
    data = input;
  }

  const lines = ['classDiagram'];

  if (data.classes) {
    for (const [name, members] of Object.entries(data.classes)) {
      lines.push(`    class ${name} {`);
      for (const m of (members || [])) {
        lines.push(`        ${m}`);
      }
      lines.push(`    }`);
    }
  }

  if (data.relations) {
    for (const rel of data.relations) {
      const [from, to, type, label] = rel;
      const arrow = type === 'inheritance' ? '--|>' :
                    type === 'composition' ? '*--' :
                    type === 'aggregation' ? 'o--' :
                    type === 'dependency' ? '..>' : '-->';
      const suffix = label ? ` : ${label}` : '';
      lines.push(`    ${from} ${arrow} ${to}${suffix}`);
    }
  }

  return lines.join('\n');
}

function genState(input) {
  let data;
  if (typeof input === 'string') {
    try { data = JSON.parse(input); } catch { data = parseArrowNotation(input); }
  } else {
    data = input;
  }

  const lines = ['stateDiagram-v2'];

  if (data.states) {
    for (const s of data.states) {
      const id = typeof s === 'string' ? s : s.id;
      const label = typeof s === 'string' ? s : (s.label || s.id);
      if (id !== label) {
        lines.push(`    ${id} : ${label}`);
      }
    }
  }

  const transitions = data.transitions || data.edges || [];
  for (const t of transitions) {
    const [from, to, label] = Array.isArray(t) ? t : [t.from, t.to, t.label];
    if (label) {
      lines.push(`    ${from} --> ${to} : ${label}`);
    } else {
      lines.push(`    ${from} --> ${to}`);
    }
  }

  return lines.join('\n');
}

function genER(input) {
  let data;
  if (typeof input === 'string') {
    try { data = JSON.parse(input); } catch { return `erDiagram\n    ${input}`; }
  } else {
    data = input;
  }

  const lines = ['erDiagram'];

  // Relations first (Mermaid ER requires relations to define entities)
  if (data.relations) {
    for (const rel of data.relations) {
      const [from, to, label] = rel;
      // Cardinality mapping
      const card = label && label.includes('many') ? '}o--||' :
                   label && label.includes('one') ? '||--||' : '}o--||';
      lines.push(`    ${from} ${card} ${to} : "${label || 'relates'}"`);
    }
  }

  // Entity attributes
  if (data.entities) {
    for (const [name, attrs] of Object.entries(data.entities)) {
      lines.push(`    ${name} {`);
      for (const attr of (attrs || [])) {
        // Parse "name TYPE" or "name TYPE KEY"
        const parts = attr.split(/\s+/);
        const fieldName = parts[0] || 'field';
        const fieldType = parts[1] || 'string';
        const key = parts[2] || '';
        lines.push(`        ${fieldType} ${fieldName} ${key}`.trimEnd());
      }
      lines.push(`    }`);
    }
  }

  return lines.join('\n');
}

function genGantt(input) {
  let data;
  if (typeof input === 'string') {
    try { data = JSON.parse(input); } catch { return `gantt\n    title Schedule\n    ${input}`; }
  } else {
    data = input;
  }

  const lines = ['gantt'];
  lines.push(`    title ${data.title || 'Project Schedule'}`);
  lines.push(`    dateFormat YYYY-MM-DD`);

  if (data.sections) {
    for (const section of data.sections) {
      lines.push(`    section ${section.name}`);
      for (const task of (section.tasks || [])) {
        const status = task.status ? `${task.status}, ` : '';
        lines.push(`    ${task.name} :${status}${task.start}, ${task.duration || task.end}`);
      }
    }
  }

  return lines.join('\n');
}

function genPie(input) {
  let data;
  if (typeof input === 'string') {
    try { data = JSON.parse(input); } catch { return `pie title Chart\n    "${input}" : 1`; }
  } else {
    data = input;
  }

  const lines = [`pie title ${data.title || 'Distribution'}`];

  const items = data.items || data.slices || data;
  if (Array.isArray(items)) {
    for (const item of items) {
      if (Array.isArray(item)) {
        lines.push(`    "${item[0]}" : ${item[1]}`);
      } else {
        lines.push(`    "${item.label}" : ${item.value}`);
      }
    }
  } else if (typeof items === 'object') {
    for (const [k, v] of Object.entries(items)) {
      if (k !== 'title') lines.push(`    "${k}" : ${v}`);
    }
  }

  return lines.join('\n');
}

function genGitGraph(input) {
  let data;
  if (typeof input === 'string') {
    try { data = JSON.parse(input); } catch { return `gitGraph\n    commit\n    ${input}`; }
  } else {
    data = input;
  }

  const lines = ['gitGraph'];

  if (data.commands) {
    for (const cmd of data.commands) {
      if (typeof cmd === 'string') {
        lines.push(`    ${cmd}`);
      } else {
        lines.push(`    ${cmd.action}${cmd.id ? ` id: "${cmd.id}"` : ''}${cmd.tag ? ` tag: "${cmd.tag}"` : ''}`);
      }
    }
  }

  return lines.join('\n');
}

// ─── Core API ───────────────────────────────────────────────────────

/**
 * Generate mermaid diagram code
 * @param {string} type - Diagram type
 * @param {string|object} input - Data or description
 * @returns {string} Mermaid code
 */
function generate(type, input) {
  const resolved = resolveType(type);
  if (!resolved) {
    const available = Object.keys(TYPES).join(', ');
    throw new Error(`Unknown diagram type "${type}". Available: ${available}`);
  }
  return TYPES[resolved].generator(input);
}

/**
 * Render mermaid code to SVG/PNG file
 * @param {string} mermaidCode - Mermaid syntax
 * @param {string} outputPath - Output file path (.svg or .png)
 * @returns {Promise<string>} Output path
 */
async function render(mermaidCode, outputPath) {
  const tmpFile = `/tmp/diagram_${Date.now()}.mmd`;
  fs.writeFileSync(tmpFile, mermaidCode, 'utf-8');

  try {
    // Try global mmdc first, then npx
    const ext = path.extname(outputPath).slice(1) || 'svg';
    const cmds = [
      `mmdc -i "${tmpFile}" -o "${outputPath}" -e ${ext}`,
      `npx -y @mermaid-js/mermaid-cli -i "${tmpFile}" -o "${outputPath}" -e ${ext}`,
    ];

    let success = false;
    for (const cmd of cmds) {
      try {
        execSync(cmd, { timeout: 30000, stdio: 'pipe' });
        success = true;
        break;
      } catch { continue; }
    }

    if (!success) {
      // Fallback: save as .mmd file
      const mmdPath = outputPath.replace(/\.\w+$/, '.mmd');
      fs.writeFileSync(mmdPath, mermaidCode, 'utf-8');
      console.error(`mermaid-cli not available. Saved raw mermaid to ${mmdPath}`);
      console.error('Install: npm i -g @mermaid-js/mermaid-cli');
      return mmdPath;
    }

    return outputPath;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

// ─── CLI ────────────────────────────────────────────────────────────

function main(argv) {
  const args = argv || process.argv.slice(2);
  let type = null;
  let input = null;
  let outputPath = null;
  let doRender = false;
  let inputFile = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--output' || a === '-o') { outputPath = args[++i]; continue; }
    if (a === '--render' || a === '-r') { doRender = true; continue; }
    if (a === '--input' || a === '-i') { inputFile = args[++i]; continue; }
    if (a === '--help' || a === '-h') {
      console.log('Usage: node index.js <type> [description|JSON] [--output file] [--render] [--input file]');
      console.log('Types: ' + Object.keys(TYPES).join(', '));
      return;
    }
    if (!type) { type = a; continue; }
    if (!input) { input = a; continue; }
  }

  // Read from stdin if piped
  if (!input && !inputFile && !process.stdin.isTTY) {
    input = fs.readFileSync('/dev/stdin', 'utf-8').trim();
    if (!type) {
      // Raw mermaid input — just render or print
      if (doRender && outputPath) {
        render(input, outputPath).then(p => console.log(`Rendered: ${p}`));
      } else {
        console.log(input);
      }
      return;
    }
  }

  // Read from file
  if (inputFile) {
    const raw = fs.readFileSync(inputFile, 'utf-8');
    try { input = JSON.parse(raw); } catch { input = raw; }
  }

  if (!type) {
    console.error('Error: diagram type required. Use --help for usage.');
    process.exit(1);
  }

  if (!input) {
    console.error('Error: input description or data required.');
    process.exit(1);
  }

  // Parse JSON string input
  if (typeof input === 'string' && (input.startsWith('{') || input.startsWith('['))) {
    try { input = JSON.parse(input); } catch {}
  }

  const mermaidCode = generate(type, input);

  if (doRender && outputPath) {
    render(mermaidCode, outputPath).then(p => console.log(`Rendered: ${p}`));
  } else if (outputPath) {
    fs.writeFileSync(outputPath, mermaidCode, 'utf-8');
    console.log(`Mermaid code written to ${outputPath}`);
  } else {
    console.log(mermaidCode);
  }

  return mermaidCode;
}

// ─── Exports ────────────────────────────────────────────────────────

module.exports = { generate, render, resolveType, TYPES, main };

if (require.main === module) {
  main();
}
