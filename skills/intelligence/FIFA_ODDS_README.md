# FIFA 2026 World Cup Odds Arbitrage Scanner

## 概述

对比主流博彩公司（Bet365, William Hill, Pinnacle 等）的 FIFA 2026 世界杯夺冠赔率与 Polymarket 价格，自动发现定价差异和套利机会。

## 使用方法

```bash
# 运行扫描
python3 /root/openclaw/skills/intelligence/fifa_odds_scanner.py

# 或作为可执行文件
/root/openclaw/skills/intelligence/fifa_odds_scanner.py
```

## 功能特性

### 1. 数据源
- **博彩公司赔率**: 
  - 当前为手动配置（综合主流博彩公司）
  - 可扩展为自动抓取 OddsPortal/BetExplorer (需处理反爬)
  
- **Polymarket 价格**:
  - 优先从 Gamma API 实时获取
  - 备用手动价格数据

### 2. 分析逻辑
- 将博彩十进制赔率转换为隐含概率
- 与 Polymarket 价格对比
- **套利阈值**: 差异 > 2% 标记为错误定价
- 方向判断:
  - 正差异: Polymarket 高估 → 卖出信号
  - 负差异: Polymarket 低估 → 买入信号

### 3. 输出格式

#### 终端报告
```
国家         博彩赔率   博彩概率   PM价格    PM概率    差异      方向           持仓
-------------------------------------------------------------------------------------
🔥 Brazil    5.50      18.18%    0.0855    8.55%    -9.63%    PM UNDERPRICED  30股 @0.086
```

#### JSON 报告
保存至 `/root/openclaw/skills/intelligence/fifa_odds_YYYYMMDD_HHMMSS.json`

```json
{
  "timestamp": "2026-03-03T23:57:45.123Z",
  "comparisons": [...],
  "arbitrage_opportunities": [
    {
      "country": "Brazil",
      "diff_pct": -9.63,
      "recommendation": "BUY"
    }
  ]
}
```

## 我们的持仓

| 国家        | 股数 | 平均价格 | 成本    |
|------------|------|---------|---------|
| Netherlands| 110  | $0.031  | $3.40   |
| Norway     | 100  | $0.031  | $2.80   |
| Germany    | 60   | $0.0545 | $3.36   |
| Portugal   | 35   | $0.0704 | $2.45   |
| Brazil     | 30   | $0.0855 | $2.64   |
| **总计**   | 335  |         | **$14.65** |

## 最新扫描结果 (2026-03-03)

### 🎯 套利机会
1. **Brazil**: PM 低估 9.6% → **强烈建议加仓** (我们已持有 30 股)
2. **France**: PM 低估 4.7% → 考虑建仓
3. **Germany**: PM 低估 4.5% → **强烈建议加仓** (我们已持有 60 股)
4. **Netherlands**: PM 低估 3.6% → **强烈建议加仓** (我们已持有 110 股)

### 📊 持仓健康度
- **总投入**: $14.65
- **当前市值**: $14.81
- **未实现盈亏**: +$0.16 (+1.1%)

**单仓分析**:
- 🟢 Brazil: -2.8% → 严重低估，强烈建议加仓
- 🟢 Germany: -2.7% → 严重低估，强烈建议加仓
- 🟢 Netherlands: +0.3% → 严重低估，强烈建议加仓
- ⚪ Norway: +10.7% → 价格合理，持有观望
- ⚪ Portugal: +0.6% → 价格合理，持有观望

## 技术细节

### 赔率转换
```python
# 十进制赔率 → 隐含概率
probability = 1.0 / decimal_odds
```

### 差异计算
```python
diff_pct = (polymarket_prob - bookmaker_prob) * 100
```

### 套利判断
```python
is_arbitrage = abs(diff_pct) > 2.0
```

## 局限性与改进

### 当前局限
1. **博彩赔率**: 手动更新，非实时（反爬限制）
2. **市场流动性**: 未考虑 Polymarket order book depth
3. **Vig/Overround**: 博彩公司利润率未调整

### 改进方向
1. **API 接入**: 
   - 使用付费 odds API (Odds API, BetGenius)
   - 浏览器自动化 (Playwright/Puppeteer)
   
2. **深度分析**:
   - 查询 Polymarket CLOB order book
   - 计算实际可成交价格
   - Kelly Criterion 仓位优化

3. **实时监控**:
   - Cron 定时扫描 (每小时)
   - 飞书通知套利机会
   - 自动交易 (谨慎!)

## 依赖项

```bash
pip3 install requests
```

## 网络配置

所有 HTTP 请求走 SOCKS5 代理:
```python
PROXY = {
    'http': 'socks5h://127.0.0.1:7880',
    'https': 'socks5h://127.0.0.1:7880'
}
```

## 相关工具

- `/root/openclaw/skills/polymarket/` - Polymarket 交易工具
- Gamma API: `https://gamma-api.polymarket.com/`
- Data API: `https://data-api.polymarket.com/`

## 最后更新

2026-03-03 23:57 UTC+8
