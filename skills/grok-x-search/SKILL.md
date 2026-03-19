---
name: grok-x-search
description: 通过 xAI Responses API + server-side tools 获取 X/Twitter 实时内容和网页搜索结果。适用于搜索X上的热点讨论、新闻验证、社交媒体情报收集。触发词：X搜索、推特搜索、grok搜索。
---

# grok-x-search v2

通过 xAI Responses API + server-side tools（x_search / web_search）获取 X/Twitter 实时内容。

## 工作原理
- 使用 `grok-4-1-fast-reasoning` 模型 + xAI Responses API
- 搜索在 **xAI 服务端**执行（x_search / web_search），无需本机翻墙
- 通过 Skyeye 中转访问，复用现有 API 配置

## 触发词
- "搜索X上的..."、"X/Twitter上关于..."、"推特热点"
- "分析推文"、"X趋势"、"Twitter讨论"
- "Grok搜索"、"社交媒体情报"

## 用法

```bash
# 搜索 X 帖子（核心功能）
node skills/grok-x-search/index.js search "AI security" --lang zh

# 搜索网页
node skills/grok-x-search/index.js web "最新网络安全漏洞" --lang zh

# 同时搜索 X + 网页（最全面）
node skills/grok-x-search/index.js both "AI agent攻击" --lang zh

# 分析用户
node skills/grok-x-search/index.js user elonmusk --lang zh

# 获取趋势
node skills/grok-x-search/index.js trending --category cybersecurity --lang zh

# 保存到文件
node skills/grok-x-search/index.js search "topic" --output result.md

# JSON 格式
node skills/grok-x-search/index.js search "topic" --json
```

## 命令

| 命令 | 工具 | 说明 |
|------|------|------|
| `search` / `x` | x_search | 搜索 X/Twitter 实时帖子 |
| `web` | web_search | 搜索网页 |
| `both` / `all` | x_search + web_search | 同时搜索 X 和网页 |
| `user` | x_search | 分析 X 用户最近动态 |
| `trending` | x_search | 获取热门趋势 |

## 选项

| 参数 | 说明 | 默认 |
|------|------|------|
| `--lang zh` | 中文输出 | 英文 |
| `--count <n>` | 结果数量 | 10 |
| `--category <cat>` | 趋势类别 | technology |
| `--model <model>` | 模型 | grok-4-1-fast-reasoning |
| `--output <file>` | 保存到文件 | - |
| `--json` | JSON 格式 | - |

## 模型

| 模型 | 速度 | 稳定性 | server-side tools |
|------|------|--------|-------------------|
| `grok-4-1-fast-reasoning` | ⚡ 快 | ✅ 稳定 | ✅ 支持 |
| `grok-4` | 🐢 慢 | ❌ 常504 | ✅ 支持 |
| `grok-3` | ⚡ 快 | ✅ 稳定 | ❌ 不支持 |

## 环境变量
| 变量 | 说明 |
|------|------|
| `GROK_API_KEY` / `SKYEYE_API_KEY` | API 密钥 |
| `GROK_API_BASE` | API URL (默认 https://api.skyeye.net/v1) |

## 注意
- 返回的 X 帖子链接是真实的（`x.com/i/status/...`）
- 搜索在 xAI 服务端执行，本机无需访问 X
- grok-4-1-fast-reasoning 是最佳选择（快+稳+支持工具）
