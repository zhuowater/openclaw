# Feishu File Send Skill

直接调用飞书 API 发送文件,绕过 Clawdbot 飞书插件的 bug。

## 快速开始

```bash
node /root/openclaw/skills/feishu-file-send/send-file.js \
  --file /path/to/file \
  --target ou_xxx \
  --message "可选的附加消息"
```

## 为什么需要这个技能?

Clawdbot 的飞书插件在使用 `message` tool 发送某些文件类型(如 `.md`)时会报 400 错误,但飞书 API 本身完全支持。此技能通过直接调用飞书 API 解决这个问题。

## 安装依赖

```bash
cd /root/openclaw/skills/feishu-file-send
npm install form-data
```

## 示例

发送 Markdown 报告:
```bash
node send-file.js \
  --file /root/openclaw/report.md \
  --target ou_db3e9415ff1c7418c317b6cdfdf1ef0d \
  --message "📄 分析报告已完成"
```

发送任意文件:
```bash
node send-file.js \
  --file /tmp/data.json \
  --target ou_db3e9415ff1c7418c317b6cdfdf1ef0d
```

## 详细文档

查看 [SKILL.md](./SKILL.md) 了解完整文档和使用说明。
