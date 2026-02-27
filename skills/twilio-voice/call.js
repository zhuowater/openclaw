#!/usr/bin/env node
/**
 * Twilio 单向语音通知 — 简单可靠
 * 用法: node call.js --to +13239037711 --message "你好！"
 * 或编程: require('./call').makeCall('+13239037711', '你好！')
 */

const https = require('https');
const querystring = require('querystring');

const SID = process.env.TWILIO_ACCOUNT_SID || 'AC1cd31002d32cd4e317c993f3bb763f2b';
const TOKEN = process.env.TWILIO_AUTH_TOKEN || 'd0fa773cb08ce71c99cf7222566b6125';
const FROM = process.env.TWILIO_FROM_NUMBER || '+18305212085';

function buildTwiML(message, options = {}) {
  const voice = options.voice || 'Polly.Zhiyu';
  const lang = options.lang || 'cmn-CN';
  
  // 按段落拆分，每段之间加停顿
  const parts = message.split('\n').filter(p => p.trim());
  let twiml = '<?xml version="1.0" encoding="UTF-8"?><Response>';
  for (const part of parts) {
    const escaped = part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    twiml += `<Say voice="${voice}" language="${lang}">${escaped}</Say>`;
    twiml += '<Pause length="1"/>';
  }
  twiml += '</Response>';
  return twiml;
}

function makeCall(to, message, options = {}) {
  return new Promise((resolve, reject) => {
    const twiml = buildTwiML(message, options);
    const data = querystring.stringify({ To: to, From: FROM, Twiml: twiml });
    
    const req = https.request({
      hostname: 'api.twilio.com',
      path: `/2010-04-01/Accounts/${SID}/Calls.json`,
      method: 'POST',
      auth: `${SID}:${TOKEN}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const r = JSON.parse(body);
          if (res.statusCode >= 400) reject(new Error(`Twilio ${res.statusCode}: ${r.message || body}`));
          else resolve({ sid: r.sid, status: r.status, to: r.to });
        } catch(e) { reject(new Error(body)); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  let to = '', message = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--to' && args[i+1]) to = args[++i];
    else if (args[i] === '--message' || args[i] === '-m') message = args[++i];
    else if (!to) to = args[i];
    else message += (message ? ' ' : '') + args[i];
  }
  if (!to || !message) {
    console.log('用法: node call.js --to +13239037711 --message "你好！"');
    process.exit(1);
  }
  makeCall(to, message)
    .then(r => console.log(`📞 已拨出 ${r.to} | SID: ${r.sid} | Status: ${r.status}`))
    .catch(e => console.error('❌', e.message));
}

module.exports = { makeCall, buildTwiML };
