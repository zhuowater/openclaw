#!/bin/bash
# 飞书语音消息转录脚本
# 使用 ElevenLabs STT API

set -e

AUDIO_FILE="$1"
LANG="${2:-zh}"  # 默认中文

if [ -z "$AUDIO_FILE" ]; then
    echo "Usage: $0 <audio_file> [language]"
    exit 1
fi

if [ ! -f "$AUDIO_FILE" ]; then
    echo "Error: File not found: $AUDIO_FILE"
    exit 1
fi

# 检查 API Key
if [ -z "$ELEVENLABS_API_KEY" ]; then
    echo "Error: ELEVENLABS_API_KEY not set"
    exit 1
fi

# 调用 ElevenLabs STT
/root/clawd/skills/elevenlabs-stt/scripts/transcribe.sh "$AUDIO_FILE" --lang "$LANG"
