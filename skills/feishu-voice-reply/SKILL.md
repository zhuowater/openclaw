---
name: feishu-voice-reply
description: 飞书语音回复工具。通过 ElevenLabs TTS 生成高质量中文语音并发送到飞书。当用户发送语音消息、回复内容较长(>100字)、或内容情感丰富时使用。
---

# 飞书语音回复

通过 ElevenLabs TTS 生成语音，以飞书语音消息形式发送。

## 使用方法

```bash
node /root/openclaw/skills/feishu-voice-reply/send-voice.js "文本内容" "回复的消息ID"
```

### Volcengine 版本（备选）

```bash
node /root/openclaw/skills/feishu-voice-reply/send-voice-volcengine.js "文本内容" "回复的消息ID"
```

## 何时使用语音回复

### ✅ 适合语音

- 用户发了语音消息（礼尚往来）
- 回复内容 >100 字（听比读轻松）
- 情感/氛围内容（安慰、鼓励、讲故事、笑话）
- 朗读类内容（诗歌、文章）

### ❌ 用文字

- 代码、命令、表格、列表
- 简短回复 <50 字
- 包含链接/文件
- 用户要求文字

## 技术细节

- **TTS**: ElevenLabs eleven_v3, Voice: Siqi Liu
- **关键技巧**: 上传 MP3 时声明 `file_type: 'opus'`，飞书会当作语音消息处理（无需 ffmpeg 转换）
- **流程**: 生成 MP3 → 获取飞书 Token → 上传 → 发送消息 → 清理临时文件

## 发送后

使用 `send-voice.js` 发送语音后，回复 `NO_REPLY` 避免重复消息。
