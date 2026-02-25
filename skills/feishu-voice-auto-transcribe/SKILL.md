---
name: feishu-voice-auto-transcribe
description: 自动转录飞书语音消息为文字，使用 ElevenLabs Speech-to-Text API
homepage: https://elevenlabs.io/speech-to-text
metadata: {"clawdbot":{"emoji":"🎙️","requires":{"env":["ELEVENLABS_API_KEY"]},"primaryEnv":"ELEVENLABS_API_KEY","autoLoad":true}}
---

# 飞书语音消息自动转录

自动检测并转录飞书语音消息为文字，让 AI 能够理解和回复语音内容。

## 功能特性

- ✅ 自动检测飞书语音消息
- ✅ 使用 ElevenLabs Scribe v2 转录（支持 90+ 语言）
- ✅ 智能语言检测（中英文自动识别）
- ✅ 转录结果自动替换消息文本
- ✅ 失败时保留原始语音消息

## 工作原理

1. 监听所有飞书消息
2. 检测到语音消息（`audio/ogg` 格式）
3. 自动调用 ElevenLabs STT API 转录
4. 将转录文本作为消息内容传给 AI
5. AI 基于文字内容生成回复

## 配置

需要设置 `ELEVENLABS_API_KEY` 环境变量：

```bash
export ELEVENLABS_API_KEY="sk_..."
```

或在 `~/.bashrc` 中添加：

```bash
echo 'export ELEVENLABS_API_KEY="sk_..."' >> ~/.bashrc
source ~/.bashrc
```

## 使用方式

安装后自动生效，无需手动调用。

### 测试

1. 在飞书中发送语音消息给 Bot
2. Bot 会自动：
   - 下载语音文件
   - 转录为文字
   - 显示转录结果
   - 基于文字内容回复

### 日志

查看转录日志：

```bash
tail -f ~/.openclaw/logs/gateway.log | grep "Voice Transcribe"
```

## 支持的语音格式

- OGG (飞书默认格式)
- MP3
- M4A
- WAV
- OPUS

## 支持的语言

自动检测，优先支持：
- 中文 (zh)
- 英文 (en)
- 日语 (ja)
- 韩语 (ko)

## 故障排查

### 转录失败

如果转录失败，会在消息中显示：

```
[语音消息转录失败: <错误信息>]
```

常见原因：
1. **API Key 未配置** - 检查环境变量
2. **网络问题** - 确保能访问 ElevenLabs API
3. **音频格式不支持** - 检查文件格式

### 查看详细错误

```bash
journalctl -u clawdbot -f | grep ERROR
```

## 技术实现

基于 ElevenLabs Speech-to-Text (Scribe v2) API：
- 端点: `https://api.elevenlabs.io/v1/audio-native`
- 识别准确率: 95%+ (中英文)
- 平均延迟: 2-5 秒

## 限制

- 音频文件大小上限: 25 MB
- 单次转录时长: < 2 小时
- 并发转录数: 根据 API 配额

## 相关技能

- `elevenlabs-stt` - 手动转录音频文件
- `local-whisper` - 本地离线转录（更慢但免费）
