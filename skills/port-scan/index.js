/**
 * port-scan — Lightweight TCP port scanner (pure Node.js, zero deps)
 *
 * Usage:
 *   node index.js <host> [options]
 *
 * Options:
 *   --ports, -p     Port range or list (default: top-100)
 *                   Examples: "1-1024", "80,443,8080", "top-100", "top-1000"
 *   --timeout, -t   Connection timeout in ms (default: 2000)
 *   --concurrency   Max concurrent connections (default: 100)
 *   --json, -j      JSON output
 *   --banner, -b    Attempt banner grabbing on open ports
 *   --quiet, -q     Only show open ports
 */

'use strict';

const net = require('net');
const { EventEmitter } = require('events');

// Top 100 most common ports (nmap-derived)
const TOP_100 = [
  7, 20, 21, 22, 23, 25, 53, 80, 110, 111, 113, 119, 135, 139, 143, 179,
  199, 389, 443, 445, 465, 514, 515, 548, 554, 587, 631, 636, 646, 873,
  990, 993, 995, 1025, 1026, 1027, 1028, 1029, 1110, 1433, 1720, 1723,
  1755, 1900, 2000, 2001, 2049, 2121, 2717, 3000, 3128, 3306, 3389,
  3986, 4899, 5000, 5009, 5051, 5060, 5101, 5190, 5357, 5432, 5631,
  5666, 5800, 5900, 5901, 6000, 6001, 6646, 7070, 8000, 8008, 8009,
  8080, 8081, 8443, 8888, 9090, 9100, 9999, 10000, 27017, 27018, 28017,
  32768, 49152, 49153, 49154, 49155, 49156, 49157, 49158, 49159, 49160,
  49161, 49163, 49165, 49167
];

// Top 1000 adds ranges (simplified — cover major services)
const TOP_1000_EXTRA = [];
for (let p = 1; p <= 1024; p++) if (!TOP_100.includes(p)) TOP_1000_EXTRA.push(p);
[1080, 1194, 1337, 1521, 1883, 2222, 2375, 2376, 3690, 4000, 4040,
 4443, 4567, 4848, 5353, 5672, 5938, 6379, 6443, 6660, 6667, 6697,
 7443, 7474, 7547, 7777, 8000, 8001, 8002, 8010, 8020, 8042, 8088,
 8181, 8282, 8383, 8484, 8585, 8686, 8787, 8880, 8983, 9000, 9001,
 9042, 9043, 9060, 9080, 9091, 9200, 9300, 9418, 9443, 9500, 9870,
 11211, 15672, 27019, 50000, 50070].forEach(p => {
  if (!TOP_100.includes(p)) TOP_1000_EXTRA.push(p);
});

// Well-known service names
const SERVICES = {
  7: 'echo', 20: 'ftp-data', 21: 'ftp', 22: 'ssh', 23: 'telnet',
  25: 'smtp', 53: 'dns', 80: 'http', 110: 'pop3', 111: 'rpcbind',
  113: 'ident', 119: 'nntp', 135: 'msrpc', 139: 'netbios-ssn',
  143: 'imap', 179: 'bgp', 389: 'ldap', 443: 'https', 445: 'smb',
  465: 'smtps', 514: 'syslog', 515: 'printer', 548: 'afp',
  554: 'rtsp', 587: 'submission', 631: 'ipp', 636: 'ldaps',
  873: 'rsync', 990: 'ftps', 993: 'imaps', 995: 'pop3s',
  1080: 'socks', 1194: 'openvpn', 1433: 'mssql', 1521: 'oracle',
  1723: 'pptp', 1883: 'mqtt', 2049: 'nfs', 2375: 'docker',
  2376: 'docker-tls', 3000: 'dev-http', 3128: 'squid-proxy',
  3306: 'mysql', 3389: 'rdp', 3690: 'svn', 4443: 'https-alt',
  5000: 'upnp', 5060: 'sip', 5432: 'postgresql', 5672: 'amqp',
  5900: 'vnc', 5938: 'teamviewer', 6379: 'redis', 6443: 'k8s-api',
  6660: 'irc', 6667: 'irc', 7474: 'neo4j', 8000: 'http-alt',
  8008: 'http-alt', 8009: 'ajp', 8080: 'http-proxy', 8081: 'http-alt',
  8443: 'https-alt', 8888: 'http-alt', 9000: 'php-fpm',
  9042: 'cassandra', 9090: 'prometheus', 9100: 'jetdirect',
  9200: 'elasticsearch', 9300: 'es-transport', 9418: 'git',
  9999: 'abyss', 10000: 'webmin', 11211: 'memcached',
  15672: 'rabbitmq-mgmt', 27017: 'mongodb', 27018: 'mongodb',
  50000: 'sap', 50070: 'hadoop-nn'
};

/**
 * Scan a single port
 * @returns {Promise<{port, state, service, banner?}>}
 */
function scanPort(host, port, timeoutMs, grabBanner) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let banner = '';
    let resolved = false;

    const finish = (state) => {
      if (resolved) return;
      resolved = true;
      sock.destroy();
      resolve({
        port,
        state,
        service: SERVICES[port] || 'unknown',
        ...(banner ? { banner: banner.trim().slice(0, 200) } : {})
      });
    };

    sock.setTimeout(timeoutMs);

    sock.on('connect', () => {
      if (grabBanner) {
        // Wait briefly for a banner
        sock.once('data', (data) => {
          banner = data.toString('utf8').replace(/[\x00-\x1f]/g, ' ');
          finish('open');
        });
        setTimeout(() => finish('open'), Math.min(timeoutMs, 1500));
      } else {
        finish('open');
      }
    });

    sock.on('timeout', () => finish('filtered'));
    sock.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') finish('closed');
      else finish('filtered');
    });

    try {
      sock.connect(port, host);
    } catch {
      finish('error');
    }
  });
}

/**
 * Parse port specification
 */
function parsePorts(spec) {
  if (!spec || spec === 'top-100') return [...TOP_100].sort((a, b) => a - b);
  if (spec === 'top-1000') return [...new Set([...TOP_100, ...TOP_1000_EXTRA])].sort((a, b) => a - b);
  if (spec === 'all') {
    const ports = [];
    for (let i = 1; i <= 65535; i++) ports.push(i);
    return ports;
  }

  const ports = new Set();
  for (const part of spec.split(',')) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(Number);
      if (isNaN(start) || isNaN(end)) continue;
      for (let p = Math.max(1, start); p <= Math.min(65535, end); p++) ports.add(p);
    } else {
      const p = parseInt(trimmed, 10);
      if (p >= 1 && p <= 65535) ports.add(p);
    }
  }
  return [...ports].sort((a, b) => a - b);
}

/**
 * Main scan function
 */
async function scan(host, options = {}) {
  const {
    ports = 'top-100',
    timeout = 2000,
    concurrency = 100,
    banner = false,
    quiet = false
  } = options;

  const portList = parsePorts(ports);
  const results = [];
  const startTime = Date.now();

  // Concurrency-limited scanning
  let idx = 0;
  const workers = [];

  async function worker() {
    while (idx < portList.length) {
      const port = portList[idx++];
      const result = await scanPort(host, port, timeout, banner);
      results.push(result);
    }
  }

  const workerCount = Math.min(concurrency, portList.length);
  for (let i = 0; i < workerCount; i++) workers.push(worker());
  await Promise.all(workers);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  results.sort((a, b) => a.port - b.port);

  const open = results.filter(r => r.state === 'open');
  const filtered = results.filter(r => r.state === 'filtered');
  const closed = results.filter(r => r.state === 'closed');

  return {
    host,
    scanTime: elapsed + 's',
    totalPorts: portList.length,
    summary: { open: open.length, filtered: filtered.length, closed: closed.length },
    open,
    ...(quiet ? {} : { filtered, closed })
  };
}

/**
 * Format results as text
 */
function formatText(result) {
  const lines = [];
  lines.push(`\n🔍 Port Scan Results for ${result.host}`);
  lines.push(`   Scanned ${result.totalPorts} ports in ${result.scanTime}`);
  lines.push(`   Open: ${result.summary.open} | Filtered: ${result.summary.filtered} | Closed: ${result.summary.closed}\n`);

  if (result.open.length === 0) {
    lines.push('   No open ports found.');
  } else {
    lines.push('   PORT      STATE   SERVICE         BANNER');
    lines.push('   ─────     ─────   ───────         ──────');
    for (const r of result.open) {
      const portStr = String(r.port).padEnd(9);
      const svcStr = (r.service || 'unknown').padEnd(15);
      const bannerStr = r.banner ? r.banner.slice(0, 60) : '';
      lines.push(`   ${portStr} open    ${svcStr} ${bannerStr}`);
    }
  }

  if (result.filtered && result.filtered.length > 0 && result.filtered.length <= 20) {
    lines.push(`\n   Filtered ports: ${result.filtered.map(r => r.port).join(', ')}`);
  } else if (result.filtered && result.filtered.length > 20) {
    lines.push(`\n   ${result.filtered.length} ports filtered (not shown)`);
  }

  lines.push('');
  return lines.join('\n');
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node index.js <host> [options]

Options:
  --ports, -p      Port spec: "1-1024", "80,443", "top-100", "top-1000"
  --timeout, -t    Connection timeout ms (default: 2000)
  --concurrency    Max concurrent connections (default: 100)
  --json, -j       JSON output
  --banner, -b     Grab service banners
  --quiet, -q      Only show open ports

Examples:
  node index.js 192.168.1.1
  node index.js example.com -p 80,443,8080 --banner
  node index.js 10.0.0.1 -p 1-1024 -t 1000 --json
`);
    process.exit(0);
  }

  const host = args.find(a => !a.startsWith('-'));
  const getArg = (short, long) => {
    const idx = args.findIndex(a => a === short || a === long);
    return idx >= 0 ? args[idx + 1] : undefined;
  };
  const hasFlag = (short, long) => args.includes(short) || args.includes(long);

  const opts = {
    ports: getArg('-p', '--ports') || 'top-100',
    timeout: parseInt(getArg('-t', '--timeout') || '2000', 10),
    concurrency: parseInt(getArg(null, '--concurrency') || '100', 10),
    banner: hasFlag('-b', '--banner'),
    quiet: hasFlag('-q', '--quiet')
  };
  const jsonOut = hasFlag('-j', '--json');

  scan(host, opts).then(result => {
    if (jsonOut) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatText(result));
    }
  }).catch(err => {
    console.error('Scan error:', err.message);
    process.exit(1);
  });
}

module.exports = { scan, scanPort, parsePorts, formatText, SERVICES, TOP_100 };
