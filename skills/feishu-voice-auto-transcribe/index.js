#!/usr/bin/env node
/**
 * Feishu Voice Auto-Transcribe - Main Entry
 * 
 * 这个脚本作为 Clawdbot skill 的入口点
 * 可以被 gateway 加载，自动处理所有飞书语音消息
 */

const transcriber = require('./lib/transcriber');

// 初始化
transcriber.init();

// 导出处理函数供 gateway 调用
module.exports = {
  name: 'feishu-voice-auto-transcribe',
  version: '1.0.0',
  
  /**
   * 消息预处理 Hook
   * 在消息传给 AI 之前调用
   */
  async onMessage(message, context) {
    // 只处理飞书消息
    if (context.channel !== 'feishu') {
      return message;
    }
    
    // 处理语音消息
    return await transcriber.processMessage(message);
  },
  
  /**
   * 健康检查
   */
  async healthCheck() {
    return {
      status: 'ok',
      apiKeyConfigured: !!process.env.ELEVENLABS_API_KEY,
    };
  },
};

// 如果直接运行（测试模式）
if (require.main === module) {
  console.log('Feishu Voice Auto-Transcribe Skill');
  console.log('Usage: Load as Clawdbot skill');
  console.log('');
  
  // 显示健康状态
  const skill = module.exports;
  skill.healthCheck().then(status => {
    console.log('Health:', status);
  });
}
