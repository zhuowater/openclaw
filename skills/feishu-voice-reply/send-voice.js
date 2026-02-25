#!/usr/bin/env node

/**
 * 飞书语音回复工具
 * 使用 ElevenLabs TTS 生成语音并发送到飞书
 * 
 * 用法：
 * node send-voice.js "文本内容" "回复的消息ID"
 * 
 * 示例：
 * node send-voice.js "你好，这是语音回复" "om_xxxxx"
 */

const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');
const FormData = require('form-data');

// 配置（从环境变量或固定值读取）
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || 'sk_87bb39c15021a84bf6f540b35a2d9460dd9bb84a79991b13';
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'bhJUNIXWQQ94l8eI2VUf';
const MODEL_ID = 'eleven_v3';

const FEISHU_APP_ID = 'cli_a9f68bf64bf9dbde';
const FEISHU_APP_SECRET = 'Blvo5l76nUkYvcyqw5YfPcdUD1GBYebi';

// TTS 生成参数（优化后的参数）
const TTS_PARAMS = {
  stability: 0.0,           // 创意模式，最大起伏
  similarity_boost: 0.5,    // 自然平衡
  style: 0.6,               // 适度表现力
  use_speaker_boost: true   // 增强清晰度
};

async function generateVoice(text) {
  console.log('🎙️ 生成语音...');
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: TTS_PARAMS
    });

    const options = {
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${VOICE_ID}`,
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errorData = '';
        res.on('data', chunk => errorData += chunk);
        res.on('end', () => {
          reject(new Error(`ElevenLabs API error: ${res.statusCode} - ${errorData}`));
        });
        return;
      }

      const output = `/tmp/voice-${Date.now()}.mp3`;
      const file = fs.createWriteStream(output);
      res.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log('✅ 语音生成成功:', output);
        resolve(output);
      });
      
      file.on('error', reject);
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getFeishuToken() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ 
      app_id: FEISHU_APP_ID, 
      app_secret: FEISHU_APP_SECRET 
    });
    
    const req = https.request({
      hostname: 'open.feishu.cn',
      path: '/open-apis/auth/v3/tenant_access_token/internal',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        const result = JSON.parse(body);
        if (result.code === 0) resolve(result.tenant_access_token);
        else reject(new Error(JSON.stringify(result)));
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function uploadToFeishu(token, audioPath) {
  console.log('📤 上传到飞书...');
  return new Promise((resolve, reject) => {
    const form = new FormData();
    // 关键技巧：声明为 opus 类型，但实际上传 MP3
    form.append('file_type', 'opus');
    form.append('file_name', 'voice.mp3');
    form.append('file', fs.createReadStream(audioPath));

    form.submit({
      protocol: 'https:',
      host: 'open.feishu.cn',
      path: '/open-apis/im/v1/files',
      headers: { 'Authorization': `Bearer ${token}` }
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
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      content: JSON.stringify({ file_key: fileKey }),
      msg_type: 'audio'
    });

    const req = https.request({
      hostname: 'open.feishu.cn',
      path: `/open-apis/im/v1/messages/${replyToMessageId}/reply`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        const result = JSON.parse(body);
        if (result.code === 0) {
          console.log('✅ 语音回复发送成功！');
          resolve(result);
        } else {
          reject(new Error(JSON.stringify(result)));
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const text = process.argv[2];
  const replyToMessageId = process.argv[3];

  if (!text || !replyToMessageId) {
    console.error('用法: node send-voice.js "文本内容" "回复的消息ID"');
    console.error('示例: node send-voice.js "你好" "om_xxxxx"');
    process.exit(1);
  }

  let audioPath;
  try {
    // 1. 生成语音
    audioPath = await generateVoice(text);
    
    // 2. 获取飞书 Token
    const token = await getFeishuToken();
    
    // 3. 上传到飞书（伪装成 opus）
    const fileKey = await uploadToFeishu(token, audioPath);
    
    // 4. 发送语音消息
    await sendVoiceMessage(token, replyToMessageId, fileKey);
    
    console.log('\n🎉 语音回复完成！');
    
  } catch (error) {
    console.error('\n❌ 失败:', error.message);
    process.exit(1);
  } finally {
    // 清理临时文件
    if (audioPath && fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
      console.log('🧹 清理临时文件');
    }
  }
}

main();
