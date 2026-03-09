#!/usr/bin/env node

/**
 * 飞书语音回复工具 - 火山引擎版（齐向东音色）
 * 使用火山引擎 TTS + 声音复刻音色生成语音并发送到飞书
 * 
 * 用法：
 * node send-voice-volcengine.js "文本内容" "回复的消息ID"
 * node send-voice-volcengine.js "文本内容" "回复的消息ID" --model 4  # 使用 ICL 2.0
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const FormData = require('form-data');

// ===== 火山引擎 TTS 配置 =====
const VOLC_APP_ID = process.env.VOLC_APP_ID || '4292933666';
const VOLC_ACCESS_TOKEN = process.env.VOLC_ACCESS_TOKEN || 'WNaCR7icfkR05AcyizRcLH0tHFNe7Hhp';
const SPEAKER_ID = process.env.VOLC_SPEAKER_ID || 'S_tgO61bXV1';

// TTS 合成使用的 resource id
const RESOURCE_MAP = {
  1: 'seed-icl-1.0',        // ICL 1.0 字符版
  4: 'seed-icl-2.0',        // ICL 2.0 字符版
};

// ===== 飞书配置 =====
const FEISHU_APP_ID = 'cli_a9f68bf64bf9dbde';
const FEISHU_APP_SECRET = 'Blvo5l76nUkYvcyqw5YfPcdUD1GBYebi';

function httpsRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const mod = options.protocol === 'http:' ? http : https;
    delete options.protocol;
    const req = mod.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({ statusCode: res.statusCode, headers: res.headers, body: buf });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function generateVoiceVolcengine(text, modelType = 4) {
  console.log(`🎙️ 火山引擎 TTS 生成语音 (model_type=${modelType}, speaker=${SPEAKER_ID})...`);
  
  const resourceId = RESOURCE_MAP[modelType] || 'seed-icl-2.0';
  
  // 使用大模型语音合成 V3 API (HTTP)
  // 文档: https://www.volcengine.com/docs/6561/1174691
  const reqId = uuidv4();
  
  const postData = JSON.stringify({
    app: {
      appid: VOLC_APP_ID,
      token: 'access_token',
      cluster: 'volcano_icl',
    },
    user: {
      uid: 'qianxin_bot',
    },
    audio: {
      voice_type: SPEAKER_ID,
      encoding: 'mp3',
      speed_ratio: 1.0,
      volume_ratio: 1.0,
      pitch_ratio: 1.0,
    },
    request: {
      reqid: reqId,
      text: text,
      text_type: 'plain',
      operation: 'query',
    },
  });

  const resp = await httpsRequest({
    hostname: 'openspeech.bytedance.com',
    path: '/api/v1/tts',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer;${VOLC_ACCESS_TOKEN}`,
      'Resource-Id': resourceId,
    },
  }, postData);

  const result = JSON.parse(resp.body.toString());
  
  if (result.code !== 3000 || !result.data) {
    // 如果 v1 TTS 不行，用 v3 voice_clone 直接合成
    console.log(`⚠️ v1 TTS failed (code=${result.code}), trying alternative...`);
    return await generateVoiceVolcengineV3(text, modelType);
  }

  // data 是 base64 编码的音频
  const audioBuffer = Buffer.from(result.data, 'base64');
  const output = `/tmp/voice-volc-${Date.now()}.mp3`;
  fs.writeFileSync(output, audioBuffer);
  console.log(`✅ 语音生成成功: ${output} (${audioBuffer.length} bytes)`);
  return output;
}

async function generateVoiceVolcengineV3(text, modelType = 1) {
  console.log(`🎙️ 尝试 V3 WebSocket TTS...`);
  
  // 使用 HTTP 合成接口 (非 WebSocket)
  // V3 大模型语音合成 API
  const resourceId = RESOURCE_MAP[modelType] || 'seed-icl-1.0';
  const reqId = uuidv4();
  
  const postData = JSON.stringify({
    model: {
      model_type: 'icl',
      voice_type: SPEAKER_ID,
    },
    audio: {
      encoding: 'mp3',
      speed: 1.0,
    },
    request: {
      reqid: reqId,
      text: text,
      operation: 'query',
    },
  });

  const resp = await httpsRequest({
    hostname: 'openspeech.bytedance.com',
    path: '/api/v3/tts',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-App-Key': VOLC_APP_ID,
      'X-Api-Access-Key': VOLC_ACCESS_TOKEN,
      'X-Api-Resource-Id': resourceId,
      'X-Api-Request-Id': reqId,
    },
  }, postData);

  // V3 可能返回二进制音频或 JSON
  const contentType = resp.headers['content-type'] || '';
  
  if (contentType.includes('audio') || resp.statusCode === 200) {
    // 尝试解析 JSON（可能包含 base64 data）
    try {
      const result = JSON.parse(resp.body.toString());
      if (result.data) {
        const audioBuffer = Buffer.from(result.data, 'base64');
        const output = `/tmp/voice-volc-${Date.now()}.mp3`;
        fs.writeFileSync(output, audioBuffer);
        console.log(`✅ V3 语音生成成功: ${output} (${audioBuffer.length} bytes)`);
        return output;
      }
      // 如果没有 data，可能是错误
      throw new Error(`V3 TTS error: ${JSON.stringify(result).substring(0, 200)}`);
    } catch (e) {
      if (resp.body.length > 1000) {
        // 可能是直接返回的二进制音频
        const output = `/tmp/voice-volc-${Date.now()}.mp3`;
        fs.writeFileSync(output, resp.body);
        console.log(`✅ V3 语音生成成功 (binary): ${output} (${resp.body.length} bytes)`);
        return output;
      }
      throw e;
    }
  }
  
  throw new Error(`V3 TTS failed: ${resp.statusCode} - ${resp.body.toString().substring(0, 200)}`);
}

async function getFeishuToken() {
  const resp = await httpsRequest({
    hostname: 'open.feishu.cn',
    path: '/open-apis/auth/v3/tenant_access_token/internal',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET }));

  const result = JSON.parse(resp.body.toString());
  if (result.code === 0) return result.tenant_access_token;
  throw new Error(`Feishu auth error: ${JSON.stringify(result)}`);
}

async function uploadToFeishu(token, audioPath) {
  console.log('📤 上传到飞书...');
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file_type', 'opus');
    form.append('file_name', 'voice.mp3');
    form.append('file', fs.createReadStream(audioPath));

    form.submit({
      protocol: 'https:',
      host: 'open.feishu.cn',
      path: '/open-apis/im/v1/files',
      headers: { 'Authorization': `Bearer ${token}` },
    }, (err, res) => {
      if (err) return reject(err);
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        const result = JSON.parse(body);
        if (result.code === 0) {
          console.log('✅ 上传成功, file_key:', result.data.file_key);
          resolve(result.data.file_key);
        } else {
          reject(new Error(JSON.stringify(result)));
        }
      });
    });
  });
}

async function sendVoiceMessage(token, replyToMessageId, fileKey) {
  console.log('💬 发送语音消息...');
  const resp = await httpsRequest({
    hostname: 'open.feishu.cn',
    path: `/open-apis/im/v1/messages/${replyToMessageId}/reply`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  }, JSON.stringify({
    content: JSON.stringify({ file_key: fileKey }),
    msg_type: 'audio',
  }));

  const result = JSON.parse(resp.body.toString());
  if (result.code === 0) {
    console.log('✅ 语音回复发送成功！');
    return result;
  }
  throw new Error(JSON.stringify(result));
}

async function main() {
  const text = process.argv[2];
  const replyToMessageId = process.argv[3];
  const modelTypeArg = process.argv.indexOf('--model');
  const modelType = modelTypeArg > -1 ? parseInt(process.argv[modelTypeArg + 1]) : 4;

  if (!text || !replyToMessageId) {
    console.error('用法: node send-voice-volcengine.js "文本" "消息ID" [--model 1|4]');
    process.exit(1);
  }

  let audioPath;
  try {
    audioPath = await generateVoiceVolcengine(text, modelType);
    const token = await getFeishuToken();
    const fileKey = await uploadToFeishu(token, audioPath);
    await sendVoiceMessage(token, replyToMessageId, fileKey);
    console.log('\n🎉 语音回复完成！(火山引擎 + 齐向东音色)');
  } catch (error) {
    console.error('\n❌ 失败:', error.message);
    process.exit(1);
  } finally {
    if (audioPath && fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }
  }
}

main();
