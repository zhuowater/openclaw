---
name: baidu-search
description: 百度AI搜索。通过 mcporter 调用百度 AppBuilder AI搜索 API，获取中文搜索结果。适用于中文情报收集、新闻搜索、事实核查。
---

# 百度AI搜索

## 适用场景

- 搜索中文新闻和情报
- 获取央视/新华社/环球时报等权威中文媒体报道
- 与英文搜索（X/Brave）交叉验证
- 中文事实核查

## 使用方法

```bash
mcporter call baidu-search.AIsearch query="搜索关键词"
```

### 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| query | ✅ | 搜索关键词，支持自然语言 |
| model | ❌ | 指定 LLM 总结模型（如 "ERNIE-3.5-8K"），留空返回原始结果 |
| instruction | ❌ | 控制输出风格和格式 |

### 基本搜索

```bash
mcporter call baidu-search.AIsearch query="伊朗战争最新消息"
```

### 带 LLM 总结的搜索

```bash
mcporter call baidu-search.AIsearch query="霍尔木兹海峡封锁影响" model="ERNIE-3.5-8K"
```

### 指定输出格式

```bash
mcporter call baidu-search.AIsearch query="网络安全最新漏洞" instruction="只返回最近24小时的结果，按时间倒序"
```

## 输出格式

返回多条搜索结果，每条包含：
- **Title**: 标题
- **Content**: 内容摘要
- **URL**: 来源链接

## 注意事项

- 不需要代理（百度 API 国内直连）
- 通过 mcporter 调用，配置在 `/root/openclaw/config/mcporter.json`
- 工具名是 `AIsearch`（注意大小写）
- 搜索结果为中文，适合与英文情报源交叉验证
- 默认返回约 10 条网页结果

## 示例场景

### 情报收集
```bash
mcporter call baidu-search.AIsearch query="伊朗战争最新消息 2026年3月"
mcporter call baidu-search.AIsearch query="霍尔木兹海峡 油轮 封锁"
mcporter call baidu-search.AIsearch query="伊朗最高领袖继任者 莫杰塔巴"
```

### 网络安全
```bash
mcporter call baidu-search.AIsearch query="最新CVE漏洞 高危"
mcporter call baidu-search.AIsearch query="APT攻击 中国 2026"
```

### 技术新闻
```bash
mcporter call baidu-search.AIsearch query="AI大模型 最新发布"
mcporter call baidu-search.AIsearch query="量子计算 突破"
```
