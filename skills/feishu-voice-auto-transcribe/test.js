#!/usr/bin/env node
/**
 * Test Feishu Voice Auto-Transcribe Skill
 */

const transcriber = require('./lib/transcriber');

// 测试消息
const testVoiceMessage = {
  channel: 'feishu',
  media: {
    path: '/root/.openclaw/media/inbound/efcec4dc-1ddb-4f38-98ac-f499794387d0',
    mimeType: 'audio/ogg; codecs=opus',
  },
  text: '',
};

const testTextMessage = {
  channel: 'feishu',
  text: '这是一条文字消息',
};

console.log('🧪 Testing Feishu Voice Auto-Transcribe\n');

// 测试 1: 检测语音消息
console.log('Test 1: Detect voice message');
console.log('Voice message:', transcriber.isVoiceMessage(testVoiceMessage));
console.log('Text message:', transcriber.isVoiceMessage(testTextMessage));
console.log('');

// 测试 2: 转录语音消息
console.log('Test 2: Transcribe voice message');
transcriber.processMessage(testVoiceMessage)
  .then(result => {
    console.log('✅ Success!');
    console.log('Original text:', testVoiceMessage.text || '(empty)');
    console.log('Transcribed text:', result.text);
    console.log('Is transcribed:', result.isTranscribed);
    console.log('Metadata:', JSON.stringify(result.metadata, null, 2));
  })
  .catch(error => {
    console.error('❌ Failed:', error.message);
  });
