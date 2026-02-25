#!/usr/bin/env node

/**
 * 语音回复 v2 - 使用 ElevenLabs 生成，通过 Clawdbot 回复机制发送
 * 
 * 用法：
 * node voice-reply-v2.js "要说的话" [message_id]
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = 'sk_87bb39c15021a84bf6f540b35a2d9460dd9bb84a79991b13';
const VOICE_ID = 'W8lBaQb9YIoddhxfQNLP';
const MODEL_ID = 'eleven_v3';

async function generateVoice(text) {
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
        'xi-api-key': API_KEY
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
        resolve(output);
      });
      
      file.on('error', reject);
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const text = process.argv[2];
  const messageId = process.argv[3];

  if (!text) {
    console.error('用法: node voice-reply-v2.js "要说的话" [message_id]');
    process.exit(1);
  }

  try {
    console.log('🎙️ 生成语音...');
    const audioPath = await generateVoice(text);
    console.log(`✅ 语音文件: ${audioPath}`);
    
    // 输出标记，让 Clawdbot 识别
    console.log(`VOICE_REPLY:${audioPath}`);
    if (messageId) {
      console.log(`REPLY_TO:${messageId}`);
    }
    
  } catch (error) {
    console.error('❌ 语音生成失败:', error.message);
    process.exit(1);
  }
}

main();
