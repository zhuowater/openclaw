#!/usr/bin/env node
'use strict';

/**
 * string-toolkit — Swiss-army-knife for string operations
 *
 * Encodes, decodes, hashes, and analyzes strings.
 * Replaces ad-hoc exec calls for base64/hex/url/jwt/hash operations.
 */

const crypto = require('crypto');
const path = require('path');

// ── Encoders ──

function base64Encode(input) {
  return Buffer.from(input, 'utf8').toString('base64');
}

function base64Decode(input) {
  return Buffer.from(input, 'base64').toString('utf8');
}

function hexEncode(input) {
  return Buffer.from(input, 'utf8').toString('hex');
}

function hexDecode(input) {
  return Buffer.from(input.replace(/\s+/g, ''), 'hex').toString('utf8');
}

function urlEncode(input) {
  return encodeURIComponent(input);
}

function urlDecode(input) {
  return decodeURIComponent(input);
}

function htmlEscape(input) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return input.replace(/[&<>"']/g, c => map[c]);
}

function htmlUnescape(input) {
  const map = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
  return input.replace(/&(?:amp|lt|gt|quot|#39);/g, m => map[m]);
}

// ── Hashers ──

function computeHash(algo, input) {
  return crypto.createHash(algo).update(input, 'utf8').digest('hex');
}

function hashAll(input) {
  return {
    md5: computeHash('md5', input),
    sha1: computeHash('sha1', input),
    sha256: computeHash('sha256', input),
    sha512: computeHash('sha512', input),
  };
}

// ── JWT Decode ──

function jwtDecode(token) {
  const parts = token.split('.');
  if (parts.length < 2) throw new Error('Invalid JWT: expected at least 2 parts');

  const decodeSegment = (seg) => {
    // Handle URL-safe base64
    let b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  };

  const header = decodeSegment(parts[0]);
  const payload = decodeSegment(parts[1]);

  const result = { header, payload };

  // Add expiry info if present
  if (payload.exp) {
    const expDate = new Date(payload.exp * 1000);
    result.expires = expDate.toISOString();
    result.expired = Date.now() > payload.exp * 1000;
  }
  if (payload.iat) {
    result.issued = new Date(payload.iat * 1000).toISOString();
  }

  return result;
}

// ── Regex Tester ──

function regexTest(pattern, flags, input) {
  const re = new RegExp(pattern, flags || 'g');
  const matches = [];
  let m;
  while ((m = re.exec(input)) !== null) {
    matches.push({
      match: m[0],
      index: m.index,
      groups: m.groups || null,
    });
    if (!re.global) break;
  }
  return { pattern, flags: flags || 'g', matchCount: matches.length, matches };
}

// ── String Stats ──

function stringStats(input) {
  const lines = input.split('\n');
  const words = input.trim().split(/\s+/).filter(Boolean);
  const chars = [...input]; // handles multi-byte
  const bytes = Buffer.byteLength(input, 'utf8');

  // Character class counts
  const alpha = input.replace(/[^a-zA-Z]/g, '').length;
  const digits = input.replace(/[^0-9]/g, '').length;
  const spaces = input.replace(/[^\s]/g, '').length;
  const special = chars.length - alpha - digits - spaces;

  return {
    chars: chars.length,
    bytes,
    words: words.length,
    lines: lines.length,
    alpha,
    digits,
    spaces,
    special,
  };
}

// ── UUID Generator ──

function generateUUID() {
  return crypto.randomUUID();
}

// ── Random String ──

function randomString(length = 32, charset = 'alphanumeric') {
  const charsets = {
    alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    hex: '0123456789abcdef',
    numeric: '0123456789',
    safe: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
  };
  const chars = charsets[charset] || charsets.alphanumeric;
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

// ── CLI ──

const COMMANDS = {
  'b64e': { fn: (args) => base64Encode(args.join(' ')), desc: 'Base64 encode' },
  'b64d': { fn: (args) => base64Decode(args.join(' ')), desc: 'Base64 decode' },
  'hexe': { fn: (args) => hexEncode(args.join(' ')), desc: 'Hex encode' },
  'hexd': { fn: (args) => hexDecode(args.join(' ')), desc: 'Hex decode' },
  'urle': { fn: (args) => urlEncode(args.join(' ')), desc: 'URL encode' },
  'urld': { fn: (args) => urlDecode(args.join(' ')), desc: 'URL decode' },
  'htmle': { fn: (args) => htmlEscape(args.join(' ')), desc: 'HTML escape' },
  'htmld': { fn: (args) => htmlUnescape(args.join(' ')), desc: 'HTML unescape' },
  'hash': { fn: (args) => JSON.stringify(hashAll(args.join(' ')), null, 2), desc: 'All hashes (MD5/SHA1/SHA256/SHA512)' },
  'md5': { fn: (args) => computeHash('md5', args.join(' ')), desc: 'MD5 hash' },
  'sha1': { fn: (args) => computeHash('sha1', args.join(' ')), desc: 'SHA-1 hash' },
  'sha256': { fn: (args) => computeHash('sha256', args.join(' ')), desc: 'SHA-256 hash' },
  'sha512': { fn: (args) => computeHash('sha512', args.join(' ')), desc: 'SHA-512 hash' },
  'jwt': { fn: (args) => JSON.stringify(jwtDecode(args[0]), null, 2), desc: 'Decode JWT (no verification)' },
  'regex': { fn: (args) => { const [pat, flags, ...rest] = args; return JSON.stringify(regexTest(pat, flags, rest.join(' ')), null, 2); }, desc: 'Test regex: pattern flags input' },
  'stats': { fn: (args) => JSON.stringify(stringStats(args.join(' ')), null, 2), desc: 'String statistics' },
  'uuid': { fn: () => generateUUID(), desc: 'Generate UUID v4' },
  'random': { fn: (args) => randomString(parseInt(args[0]) || 32, args[1]), desc: 'Random string: [length] [charset]' },
};

function printHelp() {
  console.log('string-toolkit — Swiss-army-knife for string operations\n');
  console.log('Usage: node index.js <command> [args...]\n');
  console.log('Commands:');
  for (const [name, { desc }] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(10)} ${desc}`);
  }
  console.log('\nExamples:');
  console.log('  node index.js b64e "hello world"');
  console.log('  node index.js sha256 "check this"');
  console.log('  node index.js jwt "eyJhbGciOi..."');
  console.log('  node index.js regex "\\d+" g "abc 123 def 456"');
  console.log('  node index.js uuid');
  console.log('  node index.js random 64 hex');
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }

  const cmd = args[0].toLowerCase();
  const handler = COMMANDS[cmd];

  if (!handler) {
    console.error(`Unknown command: ${cmd}`);
    printHelp();
    process.exit(1);
  }

  // Read from stdin if no args and stdin is piped
  const inputArgs = args.slice(1);
  if (inputArgs.length === 0 && !process.stdin.isTTY) {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => {
      try {
        console.log(handler.fn([data.trimEnd()]));
      } catch (e) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
      }
    });
    return;
  }

  try {
    console.log(handler.fn(inputArgs));
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

// ── Exports ──

module.exports = {
  base64Encode, base64Decode,
  hexEncode, hexDecode,
  urlEncode, urlDecode,
  htmlEscape, htmlUnescape,
  computeHash, hashAll,
  jwtDecode,
  regexTest,
  stringStats,
  generateUUID, randomString,
  main,
};

if (require.main === module) {
  main();
}
