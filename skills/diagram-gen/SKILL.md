---
name: diagram-gen
description: Generate Mermaid diagrams from structured data or descriptions. Supports flowcharts, sequence diagrams, class diagrams, state diagrams, ER diagrams, Gantt charts, pie charts, and git graphs. Use when asked to "draw a diagram", "visualize architecture", "create a flowchart", "生成图表", "画流程图", "架构图", "时序图". Can render to SVG/PNG if mermaid-cli is installed.
---

# diagram-gen

Generates Mermaid diagram code from structured input. Renders to SVG/PNG when `@mermaid-js/mermaid-cli` is available.

## Supported Diagram Types

| Type | Keyword | Use Case |
|------|---------|----------|
| `flowchart` | flowchart, flow, process | Workflows, decision trees |
| `sequence` | sequence, seq, interaction | API calls, message flows |
| `class` | class, uml | Code structure, OOP |
| `state` | state, fsm | State machines, lifecycles |
| `er` | er, entity, database | Database schemas |
| `gantt` | gantt, timeline, schedule | Project timelines |
| `pie` | pie, chart, distribution | Data distribution |
| `gitgraph` | gitgraph, git, branch | Git branching strategies |

## CLI Usage

```bash
SKILL=/root/openclaw/skills/diagram-gen/index.js

# Generate flowchart from description
node $SKILL flowchart "User login -> Validate -> Success/Fail -> Dashboard/Error"

# Generate from JSON definition file
node $SKILL --input diagram.json --output architecture.mmd

# Render to SVG (requires @mermaid-js/mermaid-cli)
node $SKILL flowchart "A -> B -> C" --render --output flow.svg

# Generate sequence diagram
node $SKILL sequence '{"actors":["Client","API","DB"],"messages":[["Client","API","GET /users"],["API","DB","SELECT"],["DB","API","rows"],["API","Client","200 OK"]]}'

# Generate ER diagram
node $SKILL er '{"entities":{"User":["id PK","name","email"],"Post":["id PK","title","user_id FK"]},"relations":[["User","Post","has many"]]}'

# Pipe raw mermaid and just render
echo "graph LR; A-->B-->C" | node $SKILL --render --output simple.svg
```

## Programmatic API

```js
const { generate, render, TYPES } = require('./skills/diagram-gen');

// Generate mermaid code
const mmd = generate('flowchart', {
  nodes: [
    { id: 'A', label: 'Start' },
    { id: 'B', label: 'Process' },
    { id: 'C', label: 'End' }
  ],
  edges: [['A', 'B'], ['B', 'C']]
});

// Render to file (requires mermaid-cli)
await render(mmd, '/tmp/diagram.svg');
```

## Notes

- Output is standard Mermaid syntax — paste into any Mermaid-compatible renderer
- Install renderer: `npm i -g @mermaid-js/mermaid-cli` (optional)
- Works without renderer — just outputs `.mmd` text for embedding in markdown
