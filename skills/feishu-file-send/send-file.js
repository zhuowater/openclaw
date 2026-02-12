#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : null;
};

const filePath = getArg('--file');
const target = getArg('--target');
const message = getArg('--message');

if (!filePath || !target) {
  console.error('Usage: node send-file.js --file <path> --target <open_id> [--message <text>]');
  console.error('Example: node send-file.js --file report.md --target ou_xxx --message "Report file"');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`Error: File not found: ${filePath}`);
  process.exit(1);
}

// Load Feishu config
const configPath = path.join(process.env.HOME || '/root', '.openclaw/openclaw.json');
let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
} catch (err) {
  console.error(`Error: Failed to load config from ${configPath}`);
  console.error(err.message);
  process.exit(1);
}

const appId = config.channels?.feishu?.appId;
const appSecret = config.channels?.feishu?.appSecret;

if (!appId || !appSecret) {
  console.error('Error: Feishu appId or appSecret not found in config');
  process.exit(1);
}

const fileName = path.basename(filePath);

// Step 1: Get tenant_access_token
function getToken() {
  return new Promise((resolve, reject) => {
    const tokenData = querystring.stringify({
      app_id: appId,
      app_secret: appSecret
    });

    const tokenOptions = {
      hostname: 'open.feishu.cn',
      port: 443,
      path: '/open-apis/auth/v3/tenant_access_token/internal',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': tokenData.length
      }
    };

    const req = https.request(tokenOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.code === 0 && json.tenant_access_token) {
            console.log('✓ Token obtained');
            resolve(json.tenant_access_token);
          } else {
            reject(new Error(`Token request failed: ${data}`));
          }
        } catch (err) {
          reject(new Error(`Token parse failed: ${err.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(tokenData);
    req.end();
  });
}

// Step 2: Upload file
function uploadFile(token) {
  return new Promise((resolve, reject) => {
    const FormData = require('form-data');
    const form = new FormData();
    
    form.append('file_type', 'stream');
    form.append('file_name', fileName);
    form.append('file', fs.createReadStream(filePath));

    const uploadOptions = {
      hostname: 'open.feishu.cn',
      port: 443,
      path: '/open-apis/im/v1/files',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        ...form.getHeaders()
      }
    };

    const req = https.request(uploadOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.code === 0 && json.data?.file_key) {
            console.log(`✓ File uploaded: ${json.data.file_key}`);
            resolve(json.data.file_key);
          } else {
            reject(new Error(`File upload failed: ${data}`));
          }
        } catch (err) {
          reject(new Error(`Upload parse failed: ${err.message}`));
        }
      });
    });

    req.on('error', reject);
    form.pipe(req);
  });
}

// Step 3: Send file message
function sendFileMessage(token, fileKey) {
  return new Promise((resolve, reject) => {
    const messageData = JSON.stringify({
      receive_id: target,
      msg_type: 'file',
      content: JSON.stringify({ 
        file_key: fileKey
      })
    });

    const messageOptions = {
      hostname: 'open.feishu.cn',
      port: 443,
      path: '/open-apis/im/v1/messages?receive_id_type=open_id',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': messageData.length
      }
    };

    const req = https.request(messageOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.code === 0 && json.data?.message_id) {
            console.log(`✓ File message sent: ${json.data.message_id}`);
            resolve(json.data.message_id);
          } else {
            reject(new Error(`File message send failed: ${data}`));
          }
        } catch (err) {
          reject(new Error(`Send parse failed: ${err.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(messageData);
    req.end();
  });
}

// Step 4: Send optional text message
function sendTextMessage(token, text) {
  return new Promise((resolve, reject) => {
    const messageData = JSON.stringify({
      receive_id: target,
      msg_type: 'text',
      content: JSON.stringify({ text })
    });

    const messageOptions = {
      hostname: 'open.feishu.cn',
      port: 443,
      path: '/open-apis/im/v1/messages?receive_id_type=open_id',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': messageData.length
      }
    };

    const req = https.request(messageOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.code === 0) {
            console.log(`✓ Text message sent`);
            resolve();
          } else {
            reject(new Error(`Text message send failed: ${data}`));
          }
        } catch (err) {
          reject(new Error(`Text parse failed: ${err.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(messageData);
    req.end();
  });
}

// Main execution
(async () => {
  try {
    const token = await getToken();
    const fileKey = await uploadFile(token);
    await sendFileMessage(token, fileKey);
    
    console.log('\n✅ File sent successfully!');
    if (message) {
      console.log(`📝 Note: Additional message "${message}" was provided but skipped`);
      console.log('   (You can add this as caption in the file message if needed)');
    }
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
})();
