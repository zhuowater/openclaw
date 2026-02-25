---
name: broken-link-checker
description: 检查文档中的失效链接（HTTP 404 和本地文件不存在）。适用于维护 MEMORY.md、analysis/*.md 等文档，自动化发现失效链接。使用场景：定期检查、git commit 前验证、文档重构后。
---

# broken-link-checker

检查文档中的失效链接（HTTP 和本地文件）。

## 功能

- 扫描 Markdown 文件中的所有链接
- 检查 HTTP(S) 链接状态（支持重定向）
- 检查本地文件路径是否存在
- 生成详细报告（文件名、行号、链接、状态）
- 支持并发检查提升速度

## 使用

### 命令行

```bash
# 检查单个文件
node /root/openclaw/skills/broken-link-checker/scripts/check.js memory/MEMORY.md

# 检查多个文件
node /root/openclaw/skills/broken-link-checker/scripts/check.js memory/*.md analysis/*.md

# 检查目录
node /root/openclaw/skills/broken-link-checker/scripts/check.js -r analysis/
```

### 编程接口

```javascript
const { checkLinks } = require('/root/openclaw/skills/broken-link-checker');

const results = await checkLinks(['memory/MEMORY.md', 'analysis/*.md']);
console.log(results);
// [
//   { file: 'MEMORY.md', line: 42, url: 'http://example.com/404', status: 'broken', reason: '404 Not Found' },
//   ...
// ]
```

## 输出示例

```
✓ memory/MEMORY.md
  ✓ http://example.com - 200 OK
  ✗ http://example.com/missing - 404 Not Found (line 42)
  ✗ ./non-existent.md - File not found (line 67)

Summary: 8 OK, 2 BROKEN
```

## 何时使用

- 定期维护（每周检查一次）
- git commit 前验证
- 重构文档后验证链接完整性
- MEMORY.md 更新后确保引用有效

## 技术细节

- 正则提取链接：`[text](url)` 和 `<url>`
- HTTP 检查：HEAD 请求（优先），失败回退 GET
- 支持重定向（3xx），最多 5 次
- 并发限制：10 个请求
- 超时：5 秒

## 限制

- 不检查 HTML/PDF 中的链接（仅 Markdown）
- 不递归检查链接的链接
- 本地路径相对于 /root/openclaw
