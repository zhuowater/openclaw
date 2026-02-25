# Twilio Voice Call 集成指南

## 🚀 快速开始

### 1. 安装依赖

```bash
cd /root/clawd/skills/twilio-voice-call
npm install
```

### 2. Twilio 账号设置

1. 注册账号: https://www.twilio.com/try-twilio
2. 获取试用 $15 额度
3. 购买电话号码（选择支持 Voice 的号码）
4. 获取凭证:
   - Account SID: `AC...`
   - Auth Token: 在控制台显示

### 3. 配置环境变量

```bash
cp .env.example .env
nano .env
```

填入你的凭证：
```bash
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1234567890
OPENAI_API_KEY=sk-proj-xxxxx
PUBLIC_URL=https://your-domain.com
```

### 4. 暴露本地服务器（开发环境）

使用 ngrok 让 Twilio 能访问你的本地服务器：

```bash
# 安装 ngrok
npm install -g ngrok

# 启动隧道
ngrok http 3000
```

复制 ngrok 的 HTTPS URL（如 `https://abc123.ngrok.io`），更新 `.env` 中的 `PUBLIC_URL`。

### 5. 启动服务器

```bash
npm start
```

看到以下输出表示成功：
```
🚀 Twilio Voice Server running on port 3000
📞 Incoming call webhook: http://localhost:3000/twilio/voice/incoming
🔌 Media stream endpoint: ws://localhost:3000/media-stream
```

### 6. 配置 Twilio Webhook

在 Twilio 控制台配置你的电话号码：
1. 进入 Phone Numbers → Manage → Active numbers
2. 点击你的号码
3. Voice Configuration → A CALL COMES IN:
   - Webhook: `https://your-ngrok-url.ngrok.io/twilio/voice/incoming`
   - HTTP POST
4. 保存

### 7. 测试

**接听来电**：
直接拨打你的 Twilio 号码，AI 会自动接听并对话。

**主动拨打**：
```bash
node make-call.js +8613800138000
```

## 🎯 工作原理

```
你拨号/接听
    ↓
Twilio 电话网关
    ↓
[WebSocket] 音频流 (μ-law PCM 8kHz)
    ↓
你的服务器 (server.js)
    ↓
OpenAI Realtime API
    ↓
GPT-4 实时理解 + 生成语音
    ↓
音频流返回 → Twilio → 你听到
```

## 📊 延迟优化

- **Twilio → 你的服务器**: ~20-50ms
- **你的服务器 → OpenAI**: ~50-100ms
- **OpenAI 处理 + TTS**: ~150-300ms
- **总延迟**: ~220-450ms（接近人类对话）

## 💰 成本

| 项目 | 价格 |
|------|------|
| Twilio 接听电话 | $0.0085/分钟（美国）|
| Twilio 拨打电话 | $0.013/分钟（美国）|
| OpenAI Realtime 音频输入 | $0.06/分钟 |
| OpenAI Realtime 音频输出 | $0.24/分钟 |
| **总计（接听）** | **~$0.31/分钟** |
| **总计（拨打）** | **~$0.32/分钟** |

国际电话价格不同，查看: https://www.twilio.com/voice/pricing

## 🔧 进阶配置

### 连接到 Clawdbot 逻辑

修改 `server.js` 中的 OpenAI 指令：

```javascript
instructions: '你是奇安信机器人，通过电话与用户对话。你可以帮助用户查询信息、设置提醒、控制智能家居等。'
```

或者集成到 Clawdbot session：

```javascript
// 在 openaiWs.on('message') 中
if (response.type === 'conversation.item.input_audio_transcription.completed') {
  const userText = response.transcript;
  
  // 发送到 Clawdbot 主会话
  const reply = await fetch('http://localhost:8080/api/sessions/send', {
    method: 'POST',
    body: JSON.stringify({
      sessionKey: 'main',
      message: userText
    })
  });
  
  const aiResponse = await reply.json();
  
  // 让 OpenAI 说出 Clawdbot 的回复
  openaiWs.send(JSON.stringify({
    type: 'conversation.item.create',
    item: {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'input_text', text: aiResponse.text }]
    }
  }));
}
```

### 多语言支持

更改 `instructions` 和 `voice`:
- 中文: `voice: 'alloy'` + 中文指令
- 英文: `voice: 'nova'` + 英文指令
- 其他语言: 参考 OpenAI 文档

## 🐛 故障排查

**WebSocket 连接失败**：
- 检查 ngrok 是否运行
- 确认 PUBLIC_URL 是 HTTPS
- Twilio Webhook 配置正确

**OpenAI API 错误**：
- 检查 API Key 是否有效
- 确认账户有余额
- 查看控制台日志

**音频质量差**：
- 检查网络延迟
- 考虑部署到云服务器（AWS/GCP）
- 使用距离 Twilio 和 OpenAI 更近的服务器

## 🌐 生产部署

推荐使用：
- **Railway**: 简单一键部署
- **Render**: 免费层足够测试
- **AWS EC2**: 完全控制
- **Google Cloud Run**: 按使用付费

部署后更新 `.env` 中的 `PUBLIC_URL` 为你的生产域名。

## 📚 参考资料

- [Twilio Voice Quickstart](https://www.twilio.com/docs/voice/quickstart/node)
- [OpenAI Realtime API Docs](https://platform.openai.com/docs/guides/realtime)
- [Twilio Media Streams](https://www.twilio.com/docs/voice/tutorials/consume-real-time-media-stream-using-websockets-python-and-flask)
