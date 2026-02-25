#!/usr/bin/env node

/**
 * ElevenLabs 语音回复 - 完整版
 * 生成语音并直接发送到飞书
 * 
 * 用法：
 * node voice-reply-final.js "要说的话" "接收者ID" ["回复消息ID"]
 */

const https = require('https');
const fs = require('fs');
const FormData = require('form-data');

// ElevenLabs 配置
const ELEVENLABS_API_KEY = 'sk_87bb39c15021a84bf6f540b35a2d9460dd9bb84a79991b13';
const VOICE_ID = 'W8lBaQb9YIoddhxfQNLP';
const MODEL_ID = 'eleven_v3';

// 飞书配置
const FEISHU_APP_ID = 'cli_a9f68bf64bf9dbde';
const FEISHU_APP_SECRET = 'Blvo5l76nUkYvcyqw5YfPcdUD1GBYebi';

async function generateVoice(text) {
  console.log('🎙️ 生成语音...');
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      text,
      model_id: MODEL_ID
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
        console.log('✅ 语音生成成功');
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
          console.log('✅ 上传成功');
          resolve(result.data.file_key);
        } else {
          reject(new Error(JSON.stringify(result)));
        }
      });
    });
  });
}

async function sendVoiceMessage(token, receiveId, fileKey, replyToMessageId = null) {
  console.log('💬 发送语音消息...');
  return new Promise((resolve, reject) => {
    const content = JSON.stringify({ file_key: fileKey });
    
    // 如果有回复消息ID，使用回复接口
    if (replyToMessageId) {
      const data = JSON.stringify({
        content,
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
    } else {
      // 普通发送
      const data = JSON.stringify({
        receive_id: receiveId,
        msg_type: 'audio',
        content
      });

      const req = https.request({
        hostname: 'open.feishu.cn',
        path: '/open-apis/im/v1/messages?receive_id_type=open_id',
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
            console.log('✅ 语音消息发送成功！');
            resolve(result);
          } else {
            reject(new Error(JSON.stringify(result)));
          }
        });
      });
      
      req.on('error', reject);
      req.write(data);
      req.end();
    }
  });
}

async function main() {
  const text = process.argv[2];
  const receiveId = process.argv[3];
  const replyToMessageId = process.argv[4];

  if (!text || !receiveId) {
    console.error('用法: node voice-reply-final.js "要说的话" "接收者ID" ["回复消息ID"]');
    console.error('示例: node voice-reply-final.js "你好" "ou_db3e9415ff1c7418c317b6cdfdf1ef0d"');
    console.error('示例: node voice-reply-final.js "你好" "ou_db3e9415ff1c7418c317b6cdfdf1ef0d" "om_xxxxx"');
    process.exit(1);
  }

  try {
    // 1. 生成语音
    const audioPath = await generateVoice(text);
    
    // 2. 获取飞书 Token
    const token = await getFeishuToken();
    
    // 3. 上传到飞书
    const fileKey = await uploadToFeishu(token, audioPath);
    
    // 4. 发送语音消息
    await sendVoiceMessage(token, receiveId, fileKey, replyToMessageId);
    
    // 5. 清理临时文件
    fs.unlinkSync(audioPath);
    
    console.log('\n🎉 语音回复完成！');
    
  } catch (error) {
    console.error('\n❌ 失败:', error.message);
    process.exit(1);
  }
}

main();
