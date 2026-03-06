---
name: config-snapshot
description: Save, compare, and restore OpenClaw configuration snapshots. Use when you need to track config changes over time, detect configuration drift, compare current config against a known-good baseline, or roll back config changes. Triggers on "config snapshot", "config diff", "config drift", "save config", "compare config", "config history".
---

# Config Snapshot

Track OpenClaw configuration changes over time with versioned snapshots.

## What It Does

- **Snapshot**: Saves current config state with timestamp and optional label
- **Compare**: Diffs two snapshots or current config vs any snapshot
- **List**: Shows all saved snapshots with labels and timestamps
- **Restore hint**: Shows what changed so you can decide whether to restore
- **Drift detect**: Compares current config against the most recent snapshot

## Usage

```bash
# Save current config snapshot
node /root/openclaw/skills/config-snapshot/index.js snapshot --label "before-upgrade"

# List all snapshots
node /root/openclaw/skills/config-snapshot/index.js list

# Compare current config against latest snapshot
node /root/openclaw/skills/config-snapshot/index.js drift

# Compare two snapshots
node /root/openclaw/skills/config-snapshot/index.js diff --from <id> --to <id>

# Compare current config against a specific snapshot
node /root/openclaw/skills/config-snapshot/index.js diff --from <id>

# Show details of a specific snapshot
node /root/openclaw/skills/config-snapshot/index.js show <id>
```

## Programmatic API

```javascript
const { snapshot, list, diff, drift } = require('./skills/config-snapshot');

// Save snapshot
const snap = await snapshot({ label: 'pre-deploy' });

// List all
const snaps = await list();

// Detect drift from latest snapshot
const changes = await drift();

// Diff two snapshots
const delta = await diff({ from: 'snap_123', to: 'snap_456' });
```

## Storage

Snapshots are stored in `memory/config-snapshots/` as JSON files.
Each snapshot includes: full config, timestamp, label, and a content hash for quick comparison.
