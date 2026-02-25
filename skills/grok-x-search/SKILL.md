# grok-x-search

通过 Grok-4 获取和分析 X/Twitter 社交媒体内容。

## 触发词
- "搜索 X 上的..."、"X/Twitter 上关于..."、"推特热点"
- "分析推文"、"X 趋势"、"Twitter 讨论"
- "Grok 搜索"、"社交媒体情报"

## 工作原理
利用 Grok-4 模型（xAI 出品，对 X 平台内容有深入理解）进行：
1. **话题搜索**：分析 X 上特定话题的讨论热度、观点阵营、关键人物
2. **趋势分析**：获取当前热门话题和趋势方向
3. **用户分析**：分析特定 X 用户的影响力、立场、关注点
4. **内容分析**：对推文内容进行情感分析、实体识别、趋势预判

## API 配置
使用 Skyeye 中转访问 Grok-4，配置已在 openclaw.json 中（skyeye-openai provider）。

## 用法

### 命令行
```bash
# 搜索话题
node skills/grok-x-search/index.js search "AI security" --lang zh

# 获取趋势
node skills/grok-x-search/index.js trending --category cybersecurity

# 分析用户
node skills/grok-x-search/index.js user elonmusk

# 分析内容
node skills/grok-x-search/index.js analyze "推文内容" --context "情感分析"

# 快速模式 (使用 grok-4-fast)
node skills/grok-x-search/index.js search "topic" --fast

# 保存输出
node skills/grok-x-search/index.js search "topic" --output result.md
```

### 在 Agent 中使用
```bash
# 搜索 X 上的讨论
exec: node /root/openclaw/skills/grok-x-search/index.js search "关键词"

# 获取科技趋势
exec: node /root/openclaw/skills/grok-x-search/index.js trending --category technology

# 分析特定用户
exec: node /root/openclaw/skills/grok-x-search/index.js user username
```

## 可用模型
| 模型 | 说明 | 速度 |
|------|------|------|
| `grok-4` | 默认，最强推理 | 慢 |
| `grok-4-fast-reasoning` | 快速推理 | 快 |
| `grok-4-1-fast-reasoning` | 最新快速版 | 快 |
| `grok-3` | 上代模型 | 中 |

## 选项
| 参数 | 说明 | 默认 |
|------|------|------|
| `--count <n>` | 结果数量 | 10 |
| `--lang <code>` | 语言 (en/zh) | en |
| `--category <cat>` | 趋势类别 | technology |
| `--context <text>` | 分析角度 | - |
| `--model <model>` | 指定模型 | grok-4 |
| `--fast` | 快速模式 | - |
| `--json` | JSON 输出 | - |
| `--output <file>` | 保存到文件 | - |

## 限制
- 通过 Skyeye 中转的 Grok-4 不具备原生 X 实时搜索 API 能力
- 分析基于 Grok-4 的训练知识，不保证实时性
- 对于实时性要求高的场景，建议配合 web_fetch 获取最新内容后用 analyze 命令分析
- 不编造具体推文 URL 或精确互动数据

## 环境变量
| 变量 | 说明 | 默认 |
|------|------|------|
| `GROK_API_KEY` | API 密钥 | Skyeye 配置 |
| `GROK_API_BASE` | API 基础 URL | https://api.skyeye.net/v1 |
| `GROK_MODEL` | 默认模型 | grok-4 |
