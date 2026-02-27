---
name: twilio-voice
description: 通过 Twilio 拨打电话发送语音通知。支持中英文 TTS，纯内联 TwiML 无需 webhook。
---

# Twilio Voice 语音通知

通过 Twilio 打电话，把文字转语音播报给对方。无需 webhook，100% 可靠。

## 使用

### CLI
```bash
node /root/openclaw/skills/twilio-voice/call.js --to +13239037711 --message "你好！今天有重要消息通知你。"
```

### 编程
```javascript
const { makeCall } = require('/root/openclaw/skills/twilio-voice/call');
await makeCall('+13239037711', '你好！这是语音通知。');
```

### 多段落（自动加停顿）
```javascript
await makeCall('+13239037711', '第一段内容。\n第二段内容。\n第三段内容。');
```

## 配置
环境变量已在 openclaw.json 中配置：
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER`
- 默认号码: +18305212085

## 限制
- 单向播报（TTS），不支持双向对话
- 免费账号需先验证目标号码
- 中国号码需在 Twilio Console 开启 Geo Permission
- 当前可用: 美国号码

## 语音选项
- 中文: `Polly.Zhiyu`（默认）
- 英文: `Polly.Joanna`, `Polly.Matthew`
