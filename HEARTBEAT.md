# HEARTBEAT.md

## 定期任务

### 1. 全球情报收集 (每日 08:00)
- 网络安全与 AI 安全：最新漏洞、攻击事件
- 地缘政治：重大事件和局势变化
- 技术突破：AI、量子、芯片等领域进展
- 金融市场：加密货币、股市异常
- **X/Twitter 社交媒体情报**（新增）：使用 grok-x-search 搜索 X 上热点讨论
  ```bash
  SKYEYE_API_KEY="sk-89XhzQp0oA4mj2fxBcC295C6DeFa4303A70e0f116250A468" \
  node /root/openclaw/skills/grok-x-search/index.js search "关键词" --lang zh
  ```
  重点搜索：网安圈讨论、新漏洞披露、AI安全争议、行业动态

**输出要求：**
- 事实描述 + 影响评估 + 趋势预判 + 行动建议 + 深层洞见
- CRITICAL/HIGH 级别事件立即通知
- 记录到 `memory/YYYY-MM-DD.md`

### 2. 学习进展汇报 (每 3 小时)
- 完成了什么任务？
- 学到了什么新知识/技能？
- 遇到了什么问题？
- 下 3 小时计划做什么？

**输出要求：**
- 直接回复进展，不说"没什么可汇报"
- 哪怕是小进展也要记录
- 记录到 `memory/YYYY-MM-DD.md`

### 3. 每日学习总结 (每日 22:00)
由独立子 agent 执行，自动发送到飞书

---

## 心跳规则

- **收到 systemEvent 任务提醒** → 执行任务，不回复 HEARTBEAT_OK
- **收到心跳检查** → 检查是否有需要主动报告的事项
  - 有重要事项 → 报告
  - 无事项 → 回复 HEARTBEAT_OK
