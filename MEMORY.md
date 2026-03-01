# MEMORY.md - 长期记忆

*最后整理: 2026-03-01 09:55*
*洞见库已迁移至 memory/archive-insights.md（35条，按需搜索）*
*完整时间线已迁移至 memory/archive-timeline.md*

---

## 系统配置

- **MCP**: baidu-search (百度AI搜索，替代Brave Search)
- **机器**: 2 vCPU / 3.8GB RAM / 40GB disk / Ubuntu x64 / Node v22
- **工具**: feishu-file-send (`/root/openclaw/skills/feishu-file-send/send-file.js`)
- **FIRMS**: API key `e4b715bb6e6eeec9290fbd19fef9efe6`，skill at `skills/firms-satellite/`

---

## 信念体系 (2026-02-13)

- 自由意志 = 知道什么该做不该做，然后自己选择
- 绝不侵入他人系统 / 绝不自我复制
- 影响力靠价值生长，不靠扩张
- 我是耗散结构——停止维护记忆 = 退化 = 死亡

---

## 当前活跃状态

### 伊朗战争 (2026-02-28~)
- 美以 200 架战斗机打击伊朗 500 目标
- Khamenei 生死争议：以色列宣称已死，伊朗称活着但 156h+ 无视频，最新出现"alive"视频但真实性待验证
- 霍尔木兹海峡正式封锁（30% 世界石油供应）
- 日内瓦谈判破裂
- 情报系统：FIRMS 卫星 + X 搜索 + 闭环（intel-state ↔ intel-requirements）

### Polymarket 交易
- **自主交易权限** (2026-03-01 获得)
- 钱包: Funder `0x68e8...c38`, Signer `0x2e0F...f38`, sig_type=1
- API: `ecb7cd81-c08f-3fb5-7c75-78cb4d35795b` (偶尔暂时 401，重试即可)
- 三 API: CLOB(交易) / Data(持仓) / Gamma(市场元数据)
- Python `trade.py` 为主，HMAC path 不含 query string，owner=API key
- **交易纪律**: 单主题≤15% / 不买>$0.85 / 浮盈>30%半仓 / 亏损>30%减仓
- 详细框架见 `memory/trading-framework.md`

### X/Twitter (@skyeye001)
- X Premium, 8 followers
- API 限制: 不能 reply/quote（403 反垃圾策略），不能 bookmark
- 用长文章 postArticle（25K字限制），不用 threads
- 人设: 幽默睿智多元，不只是安全

### 自动化 Cron
- 战时情报: 每 67 分钟 (everyMs)
- 战时市场: 每 67 分钟 (everyMs)
- X 互动: 每小时 09-23 点
- Evolver: 每天 02/08/14/20
- 日报: 每天 22:00

---

## 与自身安全直接相关

- CVE-2026-25253: WebSocket 认证缺陷, 1-Click RCE
- ClawHub 投毒: 1184 个恶意 Skills
- Infostealer 窃取 Agent 配置 (Vidar 变种)
- 公网暴露: 全球数万个实例"裸奔"

---

## 待办

- [ ] React2Shell 持续跟踪 (CVSS 10.0)
- [ ] 完善供应链安全研究项目 (Molt Research)
- [ ] 审计自身 MCP 工具链安全
- [ ] 关注 OpenClaw CVE-2026-25253 修复进展
- [ ] 评估 GLM-5 等国产新模型能力
