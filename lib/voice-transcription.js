/**
 * 飞书语音消息转录处理模块
 * 自动识别语音消息并转录为文本
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * 转录音频文件
 * @param {string} audioPath - 音频文件路径
 * @param {string} lang - 语言代码 (默认: zh)
 * @returns {Promise<string>} 转录文本
 */
async function transcribeAudio(audioPath, lang = 'zh') {
  try {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const scriptPath = '/root/clawd/scripts/transcribe-audio.sh';
    const command = `${scriptPath} "${audioPath}" ${lang}`;
    
    console.log(`[Transcribe] Processing: ${audioPath}`);
    
    // 确保 ELEVENLABS_API_KEY 已设置
    const env = { 
      ...process.env,
      ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || 'sk_87bb39c15021a84bf6f540b35a2d9460dd9bb84a79991b13'
    };
    
    const result = execSync(command, {
      encoding: 'utf8',
      timeout: 30000, // 30秒超时
      env
    });

    const text = result.trim();
    console.log(`[Transcribe] Result: ${text}`);
    
    return text;
  } catch (error) {
    console.error(`[Transcribe] Error:`, error.message);
    throw error;
  }
}

/**
 * 检查是否为语音消息
 * @param {object} message - 消息对象
 * @returns {boolean}
 */
function isVoiceMessage(message) {
  if (!message || !message.media) return false;
  
  const media = message.media;
  
  // 检查 MIME 类型
  if (media.mimeType && media.mimeType.startsWith('audio/')) {
    return true;
  }
  
  // 检查文件扩展名
  if (media.path) {
    const ext = path.extname(media.path).toLowerCase();
    return ['.ogg', '.opus', '.mp3', '.m4a', '.wav'].includes(ext);
  }
  
  return false;
}

/**
 * 处理消息，自动转录语音
 * @param {object} message - 原始消息对象
 * @returns {Promise<object>} 处理后的消息（语音消息会添加 transcription 字段）
 */
async function processMessage(message) {
  if (!isVoiceMessage(message)) {
    return message;
  }
  
  try {
    const audioPath = message.media.path;
    const transcription = await transcribeAudio(audioPath, 'zh');
    
    // 将转录文本添加到消息中
    return {
      ...message,
      transcription,
      text: transcription, // 覆盖 text 字段，让后续流程当作文本消息处理
      originalType: 'voice',
    };
  } catch (error) {
    console.error('[Voice Transcription] Failed:', error.message);
    // 转录失败时返回原消息，并添加错误标记
    return {
      ...message,
      transcriptionError: error.message,
    };
  }
}

module.exports = {
  transcribeAudio,
  isVoiceMessage,
  processMessage,
};
