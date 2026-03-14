const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const FormData = require('form-data');

/**
 * 飞书媒体发送工具
 * 支持图片、文件等媒体内容上传和发送
 */

// 瞬时网络错误重试（ECONNRESET, ETIMEDOUT, ECONNREFUSED 等）
const RETRYABLE_CODES = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'EAI_AGAIN', 'EHOSTUNREACH'];
async function withRetry(fn, { maxRetries = 3, baseDelayMs = 1000, label = 'operation' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const code = err.code || (typeof err.message === 'string' && err.message.match(/\{[^}]*"code"\s*:\s*"([^"]+)"/)?.[1]);
      if (attempt < maxRetries && RETRYABLE_CODES.includes(code)) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.log(`⚠️ ${label} 失败 (${code})，${delay}ms 后第 ${attempt + 1} 次重试...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw lastErr;
}

// 从环境变量或配置文件获取 token
function getFeishuToken() {
  // 优先从环境变量读取
  if (process.env.FEISHU_BOT_TOKEN) {
    return process.env.FEISHU_BOT_TOKEN;
  }
  
  // 从 gateway config 读取
  try {
    const configPath = '/root/.openclaw/config.json';
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.channels?.feishu?.token;
  } catch (e) {
    throw new Error('无法获取飞书 token，请设置 FEISHU_BOT_TOKEN 环境变量或配置 gateway config');
  }
}

// 从 URL 下载文件（带重试）
function downloadFile(url) {
  return withRetry(() => new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`下载失败: ${res.statusCode}`));
        return;
      }
      
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  }), { label: '下载文件' });
}

// 处理 base64 数据
function decodeBase64(dataUrl) {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error('无效的 base64 数据格式');
  }
  return {
    mimeType: matches[1],
    buffer: Buffer.from(matches[2], 'base64')
  };
}

// 上传文件到飞书（带重试）
async function uploadToFeishu(buffer, filename, token) {
  return withRetry(() => new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('image', buffer, { filename });
    form.append('image_type', 'message');

    const req = https.request({
      hostname: 'open.feishu.cn',
      path: '/open-apis/im/v1/images',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        ...form.getHeaders()
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.code !== 0) {
            reject(new Error(`上传失败: ${result.msg}`));
          } else {
            resolve(result.data.image_key);
          }
        } catch (e) {
          reject(new Error(`解析响应失败: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    form.pipe(req);
  }), { label: '上传图片' });
}

// 自动检测 receive_id 类型
function detectReceiveIdType(receiveId) {
  if (receiveId.startsWith('oc_')) return 'chat_id';
  if (receiveId.startsWith('ou_')) return 'open_id';
  if (receiveId.startsWith('on_')) return 'union_id';
  return 'chat_id'; // 默认
}

// 发送图片消息（带重试）
async function sendImageMessage(fileKey, receiveIdType, receiveId, token) {
  // 自动检测类型（如果未指定）
  if (!receiveIdType || receiveIdType === 'auto') {
    receiveIdType = detectReceiveIdType(receiveId);
  }

  return withRetry(() => new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      receive_id: receiveId,
      msg_type: 'image',
      content: JSON.stringify({ image_key: fileKey })
    });

    const req = https.request({
      hostname: 'open.feishu.cn',
      path: `/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.code !== 0) {
            reject(new Error(`发送失败: ${result.msg}`));
          } else {
            resolve(result.data);
          }
        } catch (e) {
          reject(new Error(`解析响应失败: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  }), { label: '发送图片消息' });
}

/**
 * 发送图片
 * @param {string} source - 图片来源：本地路径、URL 或 base64 数据
 * @param {string} receiveId - 接收者 ID（默认从环境变量读取）
 * @param {string} receiveIdType - 接收者类型（默认 'auto' 自动检测）
 * @returns {Promise<object>} 发送结果
 */
async function sendImage(source, receiveId = null, receiveIdType = 'auto') {
  try {
    const token = getFeishuToken();
    
    // 获取接收者 ID
    if (!receiveId) {
      receiveId = process.env.FEISHU_CHAT_ID;
      if (!receiveId) {
        throw new Error('未指定 receiveId，且环境变量 FEISHU_CHAT_ID 未设置');
      }
    }

    let buffer;
    let filename;

    // 判断来源类型并获取文件
    if (source.startsWith('http://') || source.startsWith('https://')) {
      // URL
      console.log('从 URL 下载图片...');
      buffer = await downloadFile(source);
      filename = path.basename(new URL(source).pathname) || 'image.jpg';
    } else if (source.startsWith('data:')) {
      // base64
      console.log('解析 base64 数据...');
      const decoded = decodeBase64(source);
      buffer = decoded.buffer;
      const ext = decoded.mimeType.split('/')[1] || 'jpg';
      filename = `image.${ext}`;
    } else {
      // 本地文件
      console.log('读取本地文件...');
      if (!fs.existsSync(source)) {
        throw new Error(`文件不存在: ${source}`);
      }
      buffer = fs.readFileSync(source);
      filename = path.basename(source);
    }

    // 上传文件
    console.log('上传到飞书...');
    const imageKey = await uploadToFeishu(buffer, filename, token);
    console.log(`上传成功，image_key: ${imageKey}`);

    // 发送消息
    console.log('发送图片消息...');
    const result = await sendImageMessage(imageKey, receiveIdType, receiveId, token);
    console.log('发送成功！');

    return {
      success: true,
      imageKey,
      messageId: result.message_id
    };

  } catch (error) {
    console.error('发送图片失败:', error.message);
    throw error;
  }
}

// 导出函数
module.exports = {
  sendImage,
  uploadToFeishu,
  sendImageMessage,
  detectReceiveIdType
};

// 如果直接运行此脚本
if (require.main === module) {
  const source = process.argv[2];
  const receiveId = process.argv[3];
  const receiveIdType = process.argv[4] || 'auto'; // 默认自动检测

  if (!source) {
    console.error('用法: node send-media.js <图片路径/URL/base64> [receiveId] [receiveIdType]');
    process.exit(1);
  }

  sendImage(source, receiveId, receiveIdType)
    .then(result => {
      console.log('✅ 成功:', result);
      console.log(`   Image Key: ${result.imageKey}`);
      console.log(`   Message ID: ${result.messageId}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ 失败:', error.message);
      process.exit(1);
    });
}
