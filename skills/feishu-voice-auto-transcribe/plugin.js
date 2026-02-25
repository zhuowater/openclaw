/**
 * Feishu Voice Transcribe Plugin for OpenClaw
 * 
 * 自动转录飞书语音消息
 */

const transcriber = require('./lib/transcriber');

// 插件元数据
const manifest = {
  id: 'feishu-voice-transcribe',
  name: 'Feishu Voice Auto-Transcribe',
  version: '1.0.0',
  description: 'Automatically transcribe Feishu voice messages to text',
  author: 'Qianxin AI',
  
  // Hook 定义
  hooks: [
    {
      name: 'before_agent_start',
      priority: 100, // 高优先级，在其他处理前执行
      handler: async (event, ctx) => {
        // 检查是否为飞书语音消息
        const message = event.message || event;
        
        if (!message || !message.media) {
          return null;
        }
        
        // 只处理飞书渠道的语音消息
        if (ctx.channel !== 'feishu') {
          return null;
        }
        
        if (!transcriber.isVoiceMessage(message)) {
          return null;
        }
        
        console.log('[Feishu Voice Plugin] Detected voice message, transcribing...');
        
        try {
          // 转录语音
          const processed = await transcriber.processMessage(message);
          
          if (processed.isTranscribed) {
            console.log(`[Feishu Voice Plugin] Transcription: "${processed.text}"`);
            
            // 修改消息内容
            event.message = processed;
            
            // 可以在 systemPrompt 中添加提示
            return {
              prependContext: `[用户发送了语音消息，已自动转录]\n转录内容: ${processed.text}`,
            };
          }
        } catch (error) {
          console.error('[Feishu Voice Plugin] Transcription failed:', error.message);
        }
        
        return null;
      },
    },
  ],
};

// 插件初始化函数
function init(pluginCtx) {
  console.log('[Feishu Voice Plugin] Initializing...');
  transcriber.init();
  
  const apiKeyConfigured = !!process.env.ELEVENLABS_API_KEY;
  console.log('[Feishu Voice Plugin] API Key:', apiKeyConfigured ? 'Configured ✓' : 'Missing ✗');
  
  if (!apiKeyConfigured) {
    console.warn('[Feishu Voice Plugin] WARNING: ELEVENLABS_API_KEY not configured!');
  }
  
  return {
    manifest,
    ...manifest,
  };
}

// 导出符合 OpenClaw 插件规范的对象
module.exports = init;
module.exports.manifest = manifest;
module.exports.init = init;
