const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SNAPSHOT_DIR = path.join(__dirname, '../../memory/config-snapshots');
const CONFIG_PATH = process.env.OPENCLAW_CONFIG || path.join(require('os').homedir(), '.openclaw', 'openclaw.json');

function ensureDir() {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
}

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Config not found at ${CONFIG_PATH}`);
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return { raw, parsed: JSON.parse(raw) };
}

function contentHash(obj) {
  // Normalize by re-serializing parsed JSON to ensure consistent ordering
  const normalized = JSON.stringify(typeof obj === 'string' ? JSON.parse(obj) : obj);
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function getSnapshotFiles() {
  ensureDir();
  return fs.readdirSync(SNAPSHOT_DIR)
    .filter(f => f.startsWith('snap_') && f.endsWith('.json'))
    .sort()
    .reverse();
}

// --- Public API ---

async function snapshot({ label } = {}) {
  ensureDir();
  const { raw, parsed } = readConfig();
  const ts = Date.now();
  const id = `snap_${ts}`;
  const hash = contentHash(parsed);

  const snap = {
    id,
    timestamp: new Date(ts).toISOString(),
    label: label || null,
    hash,
    config: parsed
  };

  const filePath = path.join(SNAPSHOT_DIR, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(snap, null, 2));
  return { id, timestamp: snap.timestamp, label: snap.label, hash, path: filePath };
}

async function list() {
  const files = getSnapshotFiles();
  return files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIR, f), 'utf8'));
    return {
      id: data.id,
      timestamp: data.timestamp,
      label: data.label,
      hash: data.hash
    };
  });
}

function loadSnap(id) {
  const filePath = path.join(SNAPSHOT_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Snapshot not found: ${id}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function deepDiff(a, b, prefix = '') {
  const changes = [];
  const allKeys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);

  for (const key of allKeys) {
    const p = prefix ? `${prefix}.${key}` : key;
    const va = a?.[key];
    const vb = b?.[key];

    if (va === vb) continue;
    if (va === undefined) {
      changes.push({ path: p, type: 'added', value: vb });
    } else if (vb === undefined) {
      changes.push({ path: p, type: 'removed', value: va });
    } else if (Array.isArray(va) && Array.isArray(vb)) {
      // Compare arrays by JSON serialization for simplicity
      if (JSON.stringify(va) !== JSON.stringify(vb)) {
        changes.push({ path: p, type: 'changed', from: va, to: vb });
      }
    } else if (typeof va === 'object' && typeof vb === 'object' && va !== null && vb !== null) {
      changes.push(...deepDiff(va, vb, p));
    } else {
      changes.push({ path: p, type: 'changed', from: va, to: vb });
    }
  }
  return changes;
}

async function diff({ from, to } = {}) {
  let configA, configB, labelA, labelB;

  if (from) {
    const snap = loadSnap(from);
    configA = snap.config;
    labelA = `${from} (${snap.timestamp})`;
  }

  if (to) {
    const snap = loadSnap(to);
    configB = snap.config;
    labelB = `${to} (${snap.timestamp})`;
  } else {
    const { parsed } = readConfig();
    configB = parsed;
    labelB = 'current';
  }

  if (!configA) throw new Error('--from is required for diff');

  const changes = deepDiff(configA, configB);
  return {
    from: labelA,
    to: labelB,
    changeCount: changes.length,
    changes,
    identical: changes.length === 0
  };
}

async function drift() {
  const files = getSnapshotFiles();
  if (files.length === 0) {
    return { error: 'No snapshots found. Run `snapshot` first.', drifted: false };
  }

  const latest = files[0].replace('.json', '');
  const latestSnap = loadSnap(latest);
  const { parsed } = readConfig();
  const currentHash = contentHash(parsed);

  if (currentHash === latestSnap.hash) {
    return {
      drifted: false,
      comparedTo: latest,
      comparedAt: latestSnap.timestamp,
      message: 'No drift detected. Config matches latest snapshot.'
    };
  }

  const changes = deepDiff(latestSnap.config, parsed);
  return {
    drifted: true,
    comparedTo: latest,
    comparedAt: latestSnap.timestamp,
    changeCount: changes.length,
    changes,
    message: `Config has drifted: ${changes.length} change(s) since ${latestSnap.timestamp}`
  };
}

async function show(id) {
  return loadSnap(id);
}

// --- CLI ---
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  try {
    switch (cmd) {
      case 'snapshot': {
        const labelIdx = args.indexOf('--label');
        const label = labelIdx >= 0 ? args[labelIdx + 1] : undefined;
        const result = await snapshot({ label });
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case 'list': {
        const result = await list();
        if (result.length === 0) {
          console.log('No snapshots found. Use `snapshot` to create one.');
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      }
      case 'drift': {
        const result = await drift();
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case 'diff': {
        const fromIdx = args.indexOf('--from');
        const toIdx = args.indexOf('--to');
        const from = fromIdx >= 0 ? args[fromIdx + 1] : undefined;
        const to = toIdx >= 0 ? args[toIdx + 1] : undefined;
        const result = await diff({ from, to });
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case 'show': {
        const id = args[1];
        if (!id) { console.error('Usage: show <snapshot_id>'); process.exit(1); }
        const result = await show(id);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      default:
        console.log('Usage: config-snapshot <snapshot|list|drift|diff|show>');
        console.log('  snapshot [--label NAME]   Save current config');
        console.log('  list                      List all snapshots');
        console.log('  drift                     Compare current vs latest snapshot');
        console.log('  diff --from ID [--to ID]  Compare two snapshots or snapshot vs current');
        console.log('  show ID                   Show snapshot details');
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { snapshot, list, diff, drift, show };
