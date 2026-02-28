---
name: feishu-media
description: 飞书图片发送技能 - 可靠地发送图片到飞书对话。当需要在飞书中发送图片时使用。
---

# feishu-media

飞书图片发送技能 - 可靠地发送图片到飞书对话

## 何时使用

- 用户要求发送图片："发图"、"把这图发给我"、"发送图片"
- 生成图片后需要发送："生成图片并发送"、"画个图发出来"
- 明确要求在飞书发送媒体内容

## 核心功能

### ✅ 已验证可用
使用官方 Lark SDK 上传和发送图片，经过实际测试可靠工作。

### 发送流程
1. 上传图片到飞书获取 `image_key`
2. 发送图片消息到指定对话
3. 可选：附带文字说明

## 使用方法

### 作为 Node.js 模块
```javascript
import { sendImageToFeishu } from './send-image.js';

// 发送图片到指定用户
await sendImageToFeishu(
  '/path/to/image.jpg',
  'ou_xxx',  // open_id
  '图片说明'  // 可选
);

// 发送到群聊
await sendImageToFeishu(
  '/path/to/image.png',
  'oc_xxx'  // chat_id
);
```

### 命令行使用
```bash
# 完整参数
node send-image.js /path/to/image.jpg ou_xxx "可选说明"

# 使用环境变量指定目标
export FEISHU_TARGET_ID=ou_xxx
node send-image.js /path/to/image.jpg
```

## 技术细节

### 认证
- APP_ID: `cli_a9f68bf64bf9dbde`
- APP_SECRET: 已配置（内置）
- 自动获取 access_token

### 目标 ID 类型自动识别
- `ou_xxx` → open_id（用户）
- `oc_xxx` → chat_id（群聊）

### 支持的图片格式
- JPEG, PNG, GIF, WEBP, BMP, ICO, TIFF
- 文件大小限制：20MB（飞书平台限制）

### 错误处理
- 文件不存在检查
- 上传失败自动报错
- 发送失败详细提示

## 与其他技能集成

### 配合 image-generate
```bash
# 生成图片
python /root/openclaw/skills/image-generate/image_generate.py "a cat"

# 发送图片（假设输出在 /root/openclaw/skills/image-generate/）
node /root/openclaw/skills/feishu-media/send-image.js \
  /root/openclaw/skills/image-generate/generated_image_*.png \
  ou_db3e9415ff1c7418c317b6cdfdf1ef0d
```

### 配合 antigravity-image-gen
生成后自动发送到当前会话：
```javascript
const { sendImageToFeishu } = require('./send-image.js');
const imagePath = generateImage(prompt);
await sendImageToFeishu(imagePath, targetId);
```

## 已知问题

### ❌ message 工具不可用
Clawdbot 内置的 `message` 工具发送图片到飞书时会失败（400 错误）。
原因：底层 form-data 构造有 bug。

### ✅ 推荐方案
直接使用本技能的 `send-image.js` 脚本，已验证可靠。

## 示例输出

```
📤 Uploading image to Feishu...
✅ Image uploaded, key: img_v3_02um_xxx
📨 Sending image to ou_xxx (type: open_id)...
✅ Image sent! Message ID: om_xxx
📝 Sending caption...
✅ Caption sent!
🎉 Success!
   Image Key: img_v3_02um_xxx
   Message ID: om_xxx
   Chat ID: oc_xxx
```

## 依赖

需要安装 Lark SDK：
```bash
cd /root/openclaw/skills/feishu-media
npm install @larksuiteoapi/node-sdk
```

## 最后更新

2026-02-07: 使用 Lark SDK 重写，验证可靠性
