# MCP 安全自查报告 | 2026-02-20

## 审计范围
- MCP 服务器配置 (mcporter.json)
- API 密钥管理
- 传输安全
- 工作区凭证暴露扫描

## 发现与修复

### 🔴 HIGH — 已修复

| # | 问题 | 风险 | 修复 |
|---|------|------|------|
| 1 | **百度 MCP 使用 HTTP 明文传输** | API key 和搜索内容在网络上明文传输，可被中间人窃取 | 已升级为 HTTPS，验证正常 |
| 2 | **mcporter.json 文件权限 644** | 系统上其他用户可读取含 API key 的配置 | 已修改为 600 (owner read/write only) |
| 3 | **AGENTS.md 硬编码 ElevenLabs API key** | 明文 API key 在工作区文档中，可能被提交到 git | 已替换为环境变量引用 `$ELEVENLABS_API_KEY` |

### 🟡 MEDIUM — 已修复

| # | 问题 | 风险 | 修复 |
|---|------|------|------|
| 4 | **mcporter.json 未在 .gitignore** | 含 API key 的配置文件可能被意外提交 | 已添加 .gitignore 规则 |

### 🟢 LOW — 设计注意

| # | 问题 | 备注 |
|---|------|------|
| 5 | **API key 嵌入 URL query parameter** | 百度 AppBuilder MCP 的设计限制，无法改为 header auth。风险已通过 HTTPS 缓解 |
| 6 | **仅一个 MCP 服务器** | 攻击面小，但也意味着功能单一。按需添加时需逐一审计 |

### ✅ 确认安全

- feishu-file-send 从 gateway config 读取凭证，未硬编码 ✅
- 转录脚本从环境变量读取 key ✅
- 无远程 git repo 配置，无密钥泄露到远程仓库的风险 ✅
- mcporter.json 未被 git 追踪 ✅

## 安全基线建议

1. **所有 MCP 服务器必须使用 HTTPS** — 新增服务器时检查
2. **API key 不可出现在 git 追踪的文件中** — 使用环境变量或 .gitignore
3. **配置文件权限 600** — 含密钥的文件仅 owner 可读
4. **新增 MCP 服务器前执行 `mcporter config doctor`** — 验证配置健康
5. **定期扫描硬编码密钥** — `grep -rn "sk_\|api_key\|secret" *.md config/`

## 审计结论

MCP 环境当前攻击面很小（仅百度搜索一个服务器），但存在**基础卫生问题**：明文传输、宽松权限、硬编码密钥。这些是低成本高回报的修复——已全部在本次审计中完成。

今后每次添加新 MCP 服务器时，需按上述基线逐项检查。

---
*审计执行: 2026-02-20 03:09 CST*
*审计耗时: ~15 分钟*
*下次审计建议: 添加新 MCP 服务器时 / 每月定期*
