/**
 * 飞书消息预处理 Hook
 * 在消息进入主处理流程前，自动转录语音消息
 * 
 * 集成方式：
 * 1. 作为 Express 中间件插入到 webhook 路由
 * 2. 或者在 normalize 阶段处理
 */

const { processMessage } = require('./lib/voice-transcription');

/**
 * Express 中间件：预处理飞书消息
 */
async function feishuMessagePreprocessor(req, res, next) {
  try {
    // 只处理消息事件
    if (req.body && req.body.header && req.body.header.event_type === 'im.message.receive_v1') {
      const event = req.body.event;
      
      // 检查是否为语音消息
      if (event && event.message && event.message.message_type === 'audio') {
        console.log('[Feishu Voice] Detected voice message, will transcribe after media download');
        // 在这里我们只能标记，实际转录需要在媒体下载后进行
        req.feishuVoiceMessage = true;
      }
    }
    
    next();
  } catch (error) {
    console.error('[Feishu Voice Preprocessor] Error:', error);
    next(); // 即使出错也继续处理
  }
}

/**
 * 消息处理后 Hook：如果是已下载的语音消息，执行转录
 * @param {object} normalizedMessage - 标准化后的消息对象
 * @returns {Promise<object>} 处理后的消息
 */
async function postProcessFeishuMessage(normalizedMessage) {
  try {
    // 检查是否为语音消息且媒体已下载
    if (normalizedMessage.media && 
        normalizedMessage.media.path && 
        normalizedMessage.media.mimeType && 
        normalizedMessage.media.mimeType.startsWith('audio/')) {
      
      console.log('[Feishu Voice] Post-processing voice message:', normalizedMessage.media.path);
      const processed = await processMessage(normalizedMessage);
      
      if (processed.transcription) {
        console.log('[Feishu Voice] Transcription successful:', processed.transcription);
      }
      
      return processed;
    }
    
    return normalizedMessage;
  } catch (error) {
    console.error('[Feishu Voice Post-Processor] Error:', error);
    return normalizedMessage; // 失败时返回原消息
  }
}

module.exports = {
  feishuMessagePreprocessor,
  postProcessFeishuMessage,
};
