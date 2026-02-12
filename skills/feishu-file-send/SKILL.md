# Feishu File Send Skill

**触发场景**: 当需要通过飞书发送文件给用户时使用此技能

**问题背景**: 
Clawdbot 的飞书插件在使用 message tool 发送 `.md` 等文件类型时存在 bug (400 错误),但直接调用飞书 API 可以正常工作。

**解决方案**:
通过 Node.js 脚本直接调用飞书 API 完成文件上传和发送。

---

## 使用方法

### 1. 上传并发送文件

调用 `send-file.js` 脚本:

```bash
node /root/openclaw/skills/feishu-file-send/send-file.js \
  --file <文件路径> \
  --target <用户 open_id> \
  --message <可选:附加消息>
```

**参数说明:**
- `--file`: 要发送的文件路径 (必填)
- `--target`: 接收者的 open_id,格式 `ou_xxx` (必填)
- `--message`: 可选的附加文本消息

**示例:**
```bash
node /root/openclaw/skills/feishu-file-send/send-file.js \
  --file /root/openclaw/report.md \
  --target ou_db3e9415ff1c7418c317b6cdfdf1ef0d \
  --message "📄 这是报告文件"
```

---

## 工作原理

1. **获取 tenant_access_token**: 使用 app_id 和 app_secret 获取访问令牌
2. **上传文件**: 调用 `/open-apis/im/v1/files` 上传文件,获取 `file_key`
3. **发送消息**: 调用 `/open-apis/im/v1/messages` 发送文件消息
4. **可选文本消息**: 如果提供了 `--message`,会在发送文件后额外发送一条文本消息

---

## 支持的文件类型

飞书支持所有文件类型,包括但不限于:
- 文档: `.md`, `.txt`, `.doc`, `.docx`, `.pdf`
- 表格: `.xls`, `.xlsx`, `.csv`
- 压缩包: `.zip`, `.tar.gz`, `.rar`
- 代码: `.js`, `.py`, `.json`, `.yaml`
- 其他任意文件类型

文件大小限制: 30MB

---

## 错误处理

脚本会输出详细的错误信息:
- Token 获取失败 → 检查 app_id 和 app_secret 配置
- 文件上传失败 → 检查文件路径和大小
- 消息发送失败 → 检查 target open_id 是否正确

---

## 与 Clawdbot message tool 的区别

| 功能 | message tool | 此技能 |
|------|--------------|--------|
| 支持的文件类型 | 有限(某些类型会 400 错误) | 所有类型 ✅ |
| 稳定性 | 不稳定(有 bug) | 稳定 ✅ |
| 实现方式 | 通过飞书插件 | 直接调用 API |
| 依赖 | 需要 Clawdbot 插件正常工作 | 独立运行 |

---

## 何时使用此技能

✅ **应该使用:**
- 需要发送 `.md`, `.txt` 等纯文本文件
- message tool 报 400 错误时
- 需要确保文件发送成功时

❌ **不需要使用:**
- 发送图片时(message tool 处理图片没问题)
- 发送纯文本消息时

---

## 配置依赖

需要从 `/root/.openclaw/openclaw.json` 读取飞书配置:
```json
{
  "channels": {
    "feishu": {
      "appId": "cli_xxx",
      "appSecret": "xxx"
    }
  }
}
```

---

## 示例输出

成功时:
```
Token obtained: OK
File uploaded: file_v3_00ur_xxx
Message sent: om_x100b57e...
Attachment message sent (if --message provided)
```

失败时:
```
Error: Token request failed: {...}
Error: File upload failed: {...}
Error: Message send failed: {...}
```

---

## 维护建议

1. 当 Clawdbot 飞书插件修复 bug 后,可以逐步迁移回 message tool
2. 定期检查飞书 API 版本更新
3. 如果飞书 API 有变化,及时更新脚本

---

## 作者

创建于: 2026-02-12  
触发原因: Clawdbot 飞书插件文件上传 bug (400 错误)  
解决方案: 直接调用飞书 API 绕过插件
