# Feishu Voice Auto-Transcribe

自动转录飞书语音消息。

## Installation

```bash
# Set API key
export ELEVENLABS_API_KEY="sk_..."

# Restart gateway
openclaw-cn gateway restart
```

## Usage

Automatically transcribes all Feishu voice messages.

## Technical Details

- Uses ElevenLabs Scribe v2 API
- Auto-detects Chinese/English
- Processes `.ogg` audio files
- Fallback to original message if transcription fails
