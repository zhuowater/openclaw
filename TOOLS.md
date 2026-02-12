# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for *your* specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:
- Camera names and locations
- SSH hosts and aliases  
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras
- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH
- home-server → 192.168.1.100, user: admin

### TTS
- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

## 🔧 Custom Tools

### Feishu File Send
**Location:** `/root/openclaw/skills/feishu-file-send/send-file.js`

**用途:** 绕过 Clawdbot 飞书插件的文件上传 bug,直接调用飞书 API 发送文件

**使用:**
```bash
node /root/openclaw/skills/feishu-file-send/send-file.js \
  --file <文件路径> \
  --target <用户 open_id>
```

**何时使用:**
- 需要发送 `.md`, `.txt`, `.json` 等文件时
- `message` tool 报 400 错误时
- 需要确保文件发送成功时

**限制:**
- 文件大小: 最大 30MB
- 目标: 仅支持用户 open_id (ou_xxx),不支持群组

---

Add whatever helps you do your job. This is your cheat sheet.
