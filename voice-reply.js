#!/usr/bin/env node
/**
 * 语音回复工具
 * 使用 ElevenLabs TTS 生成语音并通过飞书发送
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// ElevenLabs API 配置（从 gateway config 读取）
const ELEVENLABS_API_KEY = 'sk_87bb39c15021a84bf6f540b35a2d9460dd9bb84a79991b13';
const VOICE_ID = 'W8lBaQb9YIoddhxfQNLP'; // 配置中的语音 ID
const MODEL_ID = 'eleven_v3';

/**
 * 使用 ElevenLabs TTS 生成语音
 */
async function generateVoice(text, outputPath) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY
    },
    body: JSON.stringify({
      text: text,
      model_id: MODEL_ID,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8,
        style: 0.0,
        use_speaker_boost: true
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, audioBuffer);
  
  return outputPath;
}

/**
 * 转换 MP3 到 OPUS（飞书要求）
 */
async function convertToOpus(mp3Path, opusPath) {
  try {
    // 使用 ffmpeg 转换为 opus（需要先检查是否安装）
    await execAsync(`ffmpeg -i "${mp3Path}" -c:a libopus -b:a 64k "${opusPath}" -y`);
    return opusPath;
  } catch (error) {
    // 如果 ffmpeg 不可用，尝试直接使用 MP3（某些飞书版本支持）
    console.warn('ffmpeg not available, trying MP3 directly');
    return mp3Path;
  }
}

/**
 * 通过飞书发送语音消息
 */
async function sendVoiceToFeishu(audioPath, receiveId, replyToMessageId) {
  // 调用飞书插件的 sendMediaFeishu
  const { sendMediaFeishu } = require('/root/.clawdbot/extensions/feishu/src/media.ts');
  const config = require('/root/.openclaw/openclaw.json');
  
  const result = await sendMediaFeishu({
    cfg: config,
    to: receiveId,
    mediaUrl: audioPath,
    fileName: path.basename(audioPath),
    replyToMessageId: replyToMessageId
  });
  
  return result;
}

/**
 * 主函数：生成并发送语音回复
 */
async function voiceReply(text, receiveId, replyToMessageId) {
  const tmpDir = '/tmp/voice-replies';
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  
  const timestamp = Date.now();
  const mp3Path = path.join(tmpDir, `reply_${timestamp}.mp3`);
  const opusPath = path.join(tmpDir, `reply_${timestamp}.opus`);
  
  try {
    console.log('🎙️ 生成语音...');
    await generateVoice(text, mp3Path);
    
    console.log('🔄 转换格式...');
    const finalPath = await convertToOpus(mp3Path, opusPath);
    
    console.log('📤 发送到飞书...');
    const result = await sendVoiceToFeishu(finalPath, receiveId, replyToMessageId);
    
    console.log('✅ 语音发送成功:', result);
    
    // 清理临时文件
    if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);
    if (fs.existsSync(opusPath)) fs.unlinkSync(opusPath);
    
    return result;
  } catch (error) {
    console.error('❌ 语音回复失败:', error);
    // 清理临时文件
    if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);
    if (fs.existsSync(opusPath)) fs.unlinkSync(opusPath);
    throw error;
  }
}

// CLI 接口
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('用法: node voice-reply.js <文本> <接收者ID> [回复消息ID]');
    process.exit(1);
  }
  
  const [text, receiveId, replyToMessageId] = args;
  
  voiceReply(text, receiveId, replyToMessageId)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { voiceReply, generateVoice };
