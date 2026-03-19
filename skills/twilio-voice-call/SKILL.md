---
name: twilio-voice-call
description: Twilio 实时语音通话，真正的电话级实时 AI 对话。适用于需要语音交互的场景。
---

# Twilio 实时语音通话

**真正的电话级实时 AI 对话**

## 功能

- 📞 主动拨打电话
- 📱 接听来电
- 🎙️ 实时语音对话（<300ms 延迟）
- 🧠 连接 Clawdbot AI 逻辑
- 🌐 支持全球电话网络

## 架构

```
用户 ←→ 电话网络 ←→ Twilio ←→ WebSocket ←→ AI 服务器 ←→ Clawdbot
```

### 技术栈

- **Twilio Voice**: 电话网关 + 音频流
- **OpenAI Realtime API**: 语音理解 + 生成（VAD、打断、低延迟）
- **ElevenLabs Conversational AI**: 备选方案
- **Express Server**: Webhook 接收 + WebSocket 转发

## 配置

环境变量：
```bash
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1234567890
OPENAI_API_KEY=sk-xxxxx
PUBLIC_URL=https://your-domain.com  # 用于 Webhook
```

## 使用

### 主动拨打

```bash
node /root/clawd/skills/twilio-voice-call/make-call.js +8613800138000
```

### 接听来电

自动启动 Webhook 服务器，Twilio 配置指向：
```
https://your-domain.com/twilio/voice/incoming
```

## 成本估算

- Twilio 通话: $0.013/分钟（美国）
- OpenAI Realtime: $0.06/分钟（音频输入）+ $0.24/分钟（音频输出）
- 总计: **~$0.31/分钟**

## 实现文件

- `server.js` - Webhook + WebSocket 服务器
- `make-call.js` - 主动拨打电话
- `openai-bridge.js` - OpenAI Realtime API 集成
- `clawdbot-connector.js` - 连接到 Clawdbot 会话

## 状态

- [ ] Twilio 账号设置
- [ ] Webhook 服务器
- [ ] OpenAI Realtime 集成
- [ ] Clawdbot 逻辑连接
- [ ] 测试通话流程

## 参考

- [Twilio Voice Quickstart](https://www.twilio.com/docs/voice/quickstart/node)
- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime)
- [Twilio Media Streams](https://www.twilio.com/docs/voice/tutorials/consume-real-time-media-stream-using-websockets-python-and-flask)
