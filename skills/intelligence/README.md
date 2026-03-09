# Trump "Third Term" 关键词监控系统

## 概述

自动化监控 Trump 在演讲和社交媒体中提到 "third term" 的频率，并生成交易建议。

## 持仓信息

- **标的**: Polymarket - "Will Trump serve a third term?"
- **持仓**: 5 shares YES @ $0.46
- **现价**: $0.38 (截至 2026-03-03)
- **到期**: 2026年3月31日
- **未实现盈亏**: -$0.40 (-17.4%)

## 数据源

1. **白宫官网** (whitehouse.gov/briefing-room/speeches-remarks/)
   - 总统演讲和发言转录
   
2. **Factbase** (rollcall.com/factbase)
   - Trump 社交媒体帖子 (Twitter/Truth Social)
   - 历史发言数据库
   
3. **Web 搜索**
   - C-SPAN: 电视演讲视频
   - Rev.com: 演讲转录服务

## 监控关键词

- `third term` / `three terms`
- `12 years` (暗指三个任期)
- `2032` (第三任期结束年份)
- `term limits` (任期限制讨论)
- `repeal 22nd amendment` / `22nd amendment repeal` (修宪废除两任限制)

## 使用方法

### 手动运行

```bash
cd /root/openclaw/skills/intelligence
python3 trump_speech_monitor.py
```

### 自动化运行

添加到 crontab (每天早上 8 点运行):

```bash
# 编辑 crontab
crontab -e

# 添加这一行:
0 8 * * * cd /root/openclaw/skills/intelligence && /usr/bin/python3 trump_speech_monitor.py >> logs/monitor_$(date +\%Y\%m\%d).log 2>&1
```

或者使用 Evolver heartbeat (推荐):

```javascript
// 在 /root/openclaw/evolver/config.js 中添加
{
  name: 'trump-third-term-monitor',
  cronExpression: '0 8 * * *',  // 每天早上8点
  command: ['python3', '/root/openclaw/skills/intelligence/trump_speech_monitor.py'],
  cwd: '/root/openclaw/skills/intelligence'
}
```

## 输出格式

### JSON 报告

保存位置: `/root/openclaw/skills/intelligence/trump_third_term_report_YYYYMMDD_HHMMSS.json`

```json
{
  "timestamp": "2026-03-03T23:56:51.016694",
  "sources": {
    "factbase_twitter": [...],
    "whitehouse": [...]
  },
  "summary": {
    "sources_checked": 3,
    "sources_with_matches": 0,
    "weekly_mentions": 0,
    "top_keywords": []
  },
  "trading_signal": {
    "position": {
      "shares": 5,
      "entry_price": 0.46,
      "current_price": 0.38,
      "unrealized_pnl": -0.40,
      "unrealized_pnl_pct": -17.4
    },
    "recommendation": "🔴 减仓 50% 或止损",
    "risk_level": "HIGH",
    "action_items": [
      "卖出 2-3 shares，保留 2-3 shares 作为彩票仓位"
    ]
  }
}
```

### 终端输出

```
============================================================
🔍 Trump 'Third Term' 关键词监控系统
============================================================
📜 抓取白宫演讲...
   ➖ 无匹配
📊 抓取 Factbase 社交媒体数据...
   📥 获取到 50 条帖子
   ➖ 无匹配

============================================================
📊 监控报告
============================================================

📅 时间: 2026-03-03T23:56:51
🔍 数据源: 3 个
✅ 有匹配的源: 0 个
📈 本周提及: 0 次

💼 持仓状态:
   持仓: 5 shares @ $0.46
   现价: $0.38
   未实现盈亏: 🔴 $-0.40 (-17.4%)

🎯 交易建议:
   🔴 减仓 50% 或止损
   风险等级: HIGH

   📋 理由:
      ⚠️ 本周零提及，论点显著弱化
      💀 距到期 27 天，时间价值快速衰减

   ✅ 行动建议:
      • 卖出 2-3 shares，保留 2-3 shares 作为彩票仓位
```

## 交易决策逻辑

### 信号生成

| 本周提及次数 | 建议 | 风险等级 |
|------------|------|---------|
| 0 次 | 🔴 减仓 50% 或止损 | HIGH |
| 1 次 | 🟡 谨慎持有 | MEDIUM |
| 2-4 次 | 🟡 继续持有 | MEDIUM |
| ≥5 次 | 🟢 持有或加仓 | LOW |

### 额外考量

- **价格**: 
  - <$0.30: 严重超跌，可能是抄底机会或根本性利空
  - >$0.55: 考虑部分止盈
  
- **时间价值**:
  - 距到期 <21 天: 风险上调为 HIGH
  - 距到期 <30 天: 警告时间压力
  
- **持仓管理**:
  - 单仓亏损 >30%: 建议止损
  - 符合交易纪律的 15% 仓位上限

## 当前状态 (2026-03-03)

### 监控结果
- ✅ **脚本正常运行**
- 📊 **本周提及**: 0 次
- 🔍 **数据源**: 3 个 (白宫、Factbase、Web)
- ⚠️ **错误**: Polymarket API 返回格式问题 (已修复)

### 交易建议
- 🔴 **推荐**: 减仓 50% 或止损
- 📉 **理由**: 
  - 本周零提及，论点弱化
  - 距到期仅 27 天，时间价值快速衰减
  - 当前亏损 -17.4%
- ✅ **行动**: 卖出 2-3 shares，保留 2-3 shares 作为彩票仓位

## 历史记录

所有历史报告保存在: `/root/openclaw/skills/intelligence/trump_third_term_report_*.json`

查看最近的报告:
```bash
ls -lt /root/openclaw/skills/intelligence/trump_third_term_report_*.json | head -5
```

## 故障排查

### 问题: 代理连接失败
```
❌ 抓取白宫演讲失败: SOCKSHTTPConnectionPool...
```

**解决**: 检查 socks5 代理是否运行
```bash
curl --socks5 127.0.0.1:7880 https://api.ipify.org
```

### 问题: Polymarket API 错误
```
❌ 获取 Polymarket 价格失败: could not convert string to float
```

**解决**: 已在 v2 中修复，outcomePrices 格式处理更健壮

### 问题: Factbase API 无数据
```
📊 抓取 Factbase 社交媒体数据...
   ⚠️ 响应格式异常
```

**解决**: Factbase API 可能变更，尝试手动访问检查格式:
```bash
curl -x socks5h://127.0.0.1:7880 'https://rollcall.com/wp-json/factbase/v1/twitter?page=1&per_page=10&format=json'
```

## 未来改进

- [ ] 添加 X (Twitter) API 直接抓取 @realDonaldTrump
- [ ] 添加 YouTube 转录 (Trump 演讲视频)
- [ ] 添加 Telegram/Discord 通知
- [ ] 添加趋势图表生成 (matplotlib)
- [ ] 添加情感分析 (正面/负面/中性)
- [ ] 添加与 Polymarket 价格的相关性分析
- [ ] 自动执行交易 (集成 Polymarket CLOB API)

## 许可证

MIT

## 作者

OpenClaw Agent - 2026-03-03
