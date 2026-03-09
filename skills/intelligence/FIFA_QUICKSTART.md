# FIFA 2026 世界杯赔率套利扫描器 - 快速使用指南

## 🚀 快速开始

### 1. 运行扫描
```bash
# 方法 1: 使用便捷脚本
/root/openclaw/skills/intelligence/fifa_scan.sh

# 方法 2: 直接运行 Python
python3 /root/openclaw/skills/intelligence/fifa_odds_scanner.py
```

### 2. 更新博彩赔率
```bash
# 查看当前赔率
python3 /root/openclaw/skills/intelligence/odds_updater.py

# 更新单个国家
python3 /root/openclaw/skills/intelligence/odds_updater.py Brazil 6.0

# 批量更新
python3 /root/openclaw/skills/intelligence/odds_updater.py --batch \
  Brazil=6.0 France=6.5 England=7.5 Spain=8.5

# 重置为默认值
python3 /root/openclaw/skills/intelligence/odds_updater.py --reset
```

## 📊 输出说明

### 终端输出示例
```
====================================================================================================
                                        FIFA 2026 世界杯赔率套利分析
====================================================================================================

国家           博彩赔率       博彩概率       PM价格       PM概率       差异         方向              持仓
----------------------------------------------------------------------------------------------------
🔥 Brazil     5.50       18.18     % 0.0855     8.55      %      -9.63% PM UNDERPRICED  30股 @0.086
🔥 France     6.00       16.67     % 0.1200     12.00     %      -4.67% PM UNDERPRICED
```

**符号说明**:
- 🔥 = 套利机会 (差异 >2%)
- 负差异 = Polymarket **低估** → 买入信号
- 正差异 = Polymarket **高估** → 卖出信号

### JSON 报告
自动保存到 `/root/openclaw/skills/intelligence/fifa_odds_YYYYMMDD_HHMMSS.json`

```json
{
  "timestamp": "2026-03-03T23:57:45.089817",
  "arbitrage_opportunities": [
    {
      "country": "Brazil",
      "diff_pct": -9.63,
      "recommendation": "BUY"
    }
  ]
}
```

## 🎯 套利逻辑

### 计算公式
```python
# 博彩隐含概率
bookmaker_prob = 1.0 / decimal_odds

# Polymarket 隐含概率
polymarket_prob = price  # 价格本身就是概率 (0-1)

# 差异
diff = polymarket_prob - bookmaker_prob

# 套利判断
if abs(diff) > 2%:
    → 套利机会
```

### 交易信号
| 差异      | 方向           | 操作                |
|-----------|----------------|---------------------|
| < -3%     | PM 严重低估    | 🟢 强烈建议买入     |
| -3% ~ -2% | PM 轻微低估    | 🟢 可以买入         |
| -2% ~ +2% | 价格合理       | ⚪ 持有观望         |
| +2% ~ +3% | PM 轻微高估    | 🟡 考虑卖出         |
| > +3%     | PM 严重高估    | 🔴 强烈建议卖出     |

## 📂 文件结构

```
/root/openclaw/skills/intelligence/
├── fifa_odds_scanner.py       # 主扫描脚本
├── fifa_scan.sh               # 便捷运行脚本
├── odds_updater.py            # 赔率更新工具
├── bookmaker_odds.json        # 赔率数据存储 (自动生成)
├── fifa_odds_*.json           # 历史扫描报告
└── FIFA_ODDS_README.md        # 详细文档
```

## ⚠️ 重要提醒

### 1. 数据更新
- **博彩赔率**: 需要手动更新 (运行 `odds_updater.py`)
- **Polymarket 价格**: 当前使用备用数据，API 正在优化

### 2. 交易纪律 (来自 TOOLS.md)
- ✅ 单一主题仓位上限 15%
- ✅ 同方向不重复建仓
- ✅ 不买价格 >$0.85 的 NO
- ✅ 先查 order book 再下单
- ✅ 设止损: 单仓亏损 >30% 减仓

### 3. 局限性
- 未考虑 Polymarket 流动性和滑点
- 未调整博彩公司 vig/overround
- 赔率数据非实时 (手动更新)

## 🔧 高级用法

### 定时监控 (Cron)
```bash
# 每小时扫描一次
0 * * * * /root/openclaw/skills/intelligence/fifa_scan.sh >> /var/log/fifa_odds.log 2>&1
```

### 集成到 Heartbeat
在 `HEARTBEAT.md` 添加:
```python
# 每天 10:00 和 22:00 扫描赔率
heartbeat.schedule(
    task="fifa_odds_scan",
    cron="0 10,22 * * *",
    action=lambda: exec("/root/openclaw/skills/intelligence/fifa_scan.sh")
)
```

### 飞书通知 (TODO)
```python
# 发现套利机会时自动通知
if len(arbitrage_opportunities) > 0:
    message.send(
        target="ou_xxx",  # 你的 open_id
        message=f"🔥 发现 {len(arbitrage_opportunities)} 个套利机会！"
    )
```

## 📈 最新扫描结果

**运行时间**: 2026-03-03 23:59:59

**套利机会** (4个):
1. Brazil: PM 低估 9.6% → 强烈建议加仓 (我们已持有 30 股)
2. France: PM 低估 4.7% → 考虑建仓
3. Germany: PM 低估 4.5% → 强烈建议加仓 (我们已持有 60 股)
4. Netherlands: PM 低估 3.6% → 强烈建议加仓 (我们已持有 110 股)

**持仓健康度**: +1.1% 未实现盈亏

## 🆘 故障排除

### 问题: "使用备用价格数据"
**原因**: 无法从 Polymarket API 获取实时价格  
**解决**: 当前属于正常，脚本会使用手动配置的价格数据

### 问题: 赔率数据过时
**解决**: 运行 `odds_updater.py` 手动更新

### 问题: 找不到套利机会
**原因**: 
1. 博彩赔率未更新
2. Polymarket 价格已调整
3. 市场定价确实合理

**解决**: 更新博彩赔率数据后重新扫描

## 📚 相关资源

- [详细文档](./FIFA_ODDS_README.md)
- [Polymarket 交易工具](../polymarket/)
- [TOOLS.md](../../TOOLS.md) - 交易纪律和教训

## ⚖️ 免责声明

本工具仅供信息参考，不构成投资建议。交易有风险，决策需谨慎。
