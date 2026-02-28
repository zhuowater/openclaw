---
name: feishu-voice-conversation
description: 飞书语音对话技能 - 完整的语音输入输出循环。支持语音消息转录和语音回复。
---

# 飞书语音对话技能

**完整的语音输入输出循环**

## 功能

- ✅ 自动转录收到的语音消息
- ✅ AI 正常处理对话
- ✅ 自动用语音回复（TTS）

## 工作流程

```
用户语音消息 
    ↓
[自动转录] ElevenLabs Speech-to-Text
    ↓
[AI处理] OpenClaw 正常对话流程
    ↓
[生成语音] ElevenLabs TTS
    ↓
飞书语音回复
```

## 技术实现

### 核心模块

1. **语音转录**: `/root/clawd/lib/voice-transcription.js`
2. **语音生成**: `/root/clawd/skills/feishu-voice-reply/send-voice.js`
3. **自动化插件**: `/root/clawd/lib/feishu-voice-hook.js`

### Hook 机制

通过 OpenClaw 的 `feishu.onMessage` Hook 拦截消息：

```javascript
// 在消息到达 AI 之前
onMessage: async (message) => {
  if (isVoiceMessage(message)) {
    // 转录语音
    const text = await transcribeAudio(message.media.path);
    message.text = text;
    message.isTranscribed = true;
  }
  return message;
}

// 在 AI 回复之后
onReply: async (reply, originalMessage) => {
  if (originalMessage.isTranscribed) {
    // 用语音回复
    await sendVoiceReply(reply.text, originalMessage.message_id);
    return { ...reply, sentAsVoice: true };
  }
  return reply;
}
```

## 配置

环境变量：
- `ELEVENLABS_API_KEY`: ElevenLabs API 密钥
- `ELEVENLABS_VOICE_ID`: 语音模型 ID（默认: W8lBaQb9YIoddhxfQNLP）

## 使用方式

**自动化（推荐）**：
- 发送语音消息 → 自动转录 → AI 处理 → 语音回复

**手动触发**：
```bash
# 只转录
node /root/clawd/lib/voice-transcription.js <audio_path>

# 只生成语音回复
node /root/clawd/skills/feishu-voice-reply/send-voice.js "文本" "message_id"
```

## 状态

- [x] 语音转录模块
- [x] 语音回复工具
- [ ] 自动化 Hook 集成
- [ ] 测试完整流程

## 下一步

需要找到 OpenClaw 正确的扩展点来实现自动化拦截。
