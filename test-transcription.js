// 测试语音转录模块
const voiceTranscription = require('./lib/voice-transcription');

const testMessage = {
  media: {
    path: '/root/.openclaw/media/inbound/efcec4dc-1ddb-4f38-98ac-f499794387d0',
    mimeType: 'audio/ogg; codecs=opus'
  },
  text: ''
};

console.log('Testing voice transcription...\n');

voiceTranscription.processMessage(testMessage)
  .then(result => {
    console.log('\n✅ Success!');
    console.log('Original text:', testMessage.text || '(empty)');
    console.log('Transcription:', result.transcription);
    console.log('New text:', result.text);
  })
  .catch(error => {
    console.error('\n❌ Failed:', error.message);
  });
