#!/usr/bin/env node
/**
 * 飞书语音消息完整处理流程测试
 * 
 * 模拟：飞书语音消息 -> 下载 -> 转录 -> AI 处理 -> 回复
 */

const transcriber = require('./skills/feishu-voice-auto-transcribe/lib/transcriber');

// 模拟从飞书收到的语音消息
const incomingVoiceMessage = {
  channel: 'feishu',
  from: 'user_test',
  media: {
    path: '/root/.openclaw/media/inbound/efcec4dc-1ddb-4f38-98ac-f499794387d0',
    mimeType: 'audio/ogg; codecs=opus',
  },
  text: '',
  timestamp: Date.now(),
};

console.log('📱 收到飞书语音消息');
console.log('='.repeat(40));
console.log(JSON.stringify(incomingVoiceMessage, null, 2));
console.log('\n🎙️  开始转录...\n');

transcriber.processMessage(incomingVoiceMessage)
  .then(processedMessage => {
    console.log('✅ 转录完成！');
    console.log('='.repeat(40));
    console.log('转录文本:', processedMessage.text);
    console.log('是否转录:', processedMessage.isTranscribed);
    console.log('\n📤 现在可以将文本发送给 AI 处理...');
    console.log('\n模拟 AI 回复:');
    console.log('---');
    console.log(`收到你的消息："${processedMessage.text}"，你好！`);
    console.log('---');
  })
  .catch(error => {
    console.error('\n❌ 转录失败:', error.message);
  });
