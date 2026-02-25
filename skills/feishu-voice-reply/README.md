# 飞书语音回复技能

快速发送 ElevenLabs 高质量中文语音到飞书。

## 使用方法

```bash
node /root/clawd/skills/feishu-voice-reply/send-voice.js "文本内容" "回复的消息ID"
```

### 示例

```bash
node /root/clawd/skills/feishu-voice-reply/send-voice.js "你好，这是语音回复" "om_xxxxx"
```

## 核心技术

1. **ElevenLabs TTS**
   - Voice: Siqi Liu (W8lBaQb9YIoddhxfQNLP)
   - Model: eleven_v3
   - 优化参数：stability=0.0, similarity_boost=0.5, style=0.6

2. **飞书语音消息技巧**
   - 生成 MP3 格式
   - 上传时声明 `file_type: 'opus'`（伪装）
   - 飞书接受并作为语音消息处理
   - **无需 ffmpeg 转换！**

3. **自动化流程**
   - 生成语音 → 获取 Token → 上传文件 → 发送消息 → 清理临时文件

## 配置

脚本已内置配置，也支持环境变量：

```bash
export ELEVENLABS_API_KEY="sk_xxx"
export ELEVENLABS_VOICE_ID="W8lBaQb9YIoddhxfQNLP"
```

## 技术发现

**关键发现**：飞书不检查音频文件的实际格式，只看上传时声明的 `file_type`！

- 声明 `file_type: 'opus'` + 上传 MP3 = 语音消息 ✅
- 直接发送 MP3 文件 = 普通文件 ❌
- 转换成真正的 Opus 格式 = 语音消息 ✅（但多余）

所以最优方案是**伪装法**：省去 ffmpeg 转换步骤，直接上传 MP3 并声明为 opus。

## 依赖

```bash
npm install form-data
```

已安装在全局环境中。
