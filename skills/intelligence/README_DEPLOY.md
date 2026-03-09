# ADS-B 军事航班监控 - 部署指南

## ✅ 已完成

### 核心功能
- ✅ OpenSky Network API 集成 (免费层)
- ✅ 军用运输机识别 (RCH, CMB, SPAR 等 callsign)
- ✅ 关键基地监控 (Dover, Ramstein, Al Udeid, Bahrain 等)
- ✅ 中东地区活动统计
- ✅ 伊朗领空民航绕飞检测
- ✅ 威胁评分系统 (0-100)
- ✅ JSON 格式输出
- ✅ 代理支持 (SOCKS5) + 直连 fallback
- ✅ Polymarket 交易信号集成

### 文件结构
```
skills/intelligence/
├── adsb_monitor.py              # 核心监控脚本
├── adsb_polymarket_signals.py   # Polymarket 信号生成器
├── SKILL.md                     # 使用文档
├── README_DEPLOY.md             # 本文件
├── quick_test.sh                # 快速测试脚本
└── test_monitor.sh              # 完整测试脚本
```

## 🚀 快速开始

### 1. 运行一次测试
```bash
cd /root/openclaw
bash skills/intelligence/quick_test.sh
```

### 2. 查看结果
```bash
# 简要报告 (stderr)
tail -20 /tmp/adsb_latest_run.log | grep "^🎯\|^✈️\|^🇮🇷"

# 完整 JSON
jq . /tmp/adsb_latest_run.log | grep -A 100 "^{"
```

### 3. 生成交易信号
```bash
# 先运行监控并保存到 /tmp/adsb_latest.json
ADSB_USE_PROXY=false python3 skills/intelligence/adsb_monitor.py > /tmp/adsb_latest.json 2>&1

# 生成 Polymarket 信号
python3 skills/intelligence/adsb_polymarket_signals.py
```

## 📅 定时任务配置

### Cron (推荐)

编辑 crontab:
```bash
crontab -e
```

添加 (每 2 小时运行):
```cron
# ADS-B 军事航班监控 (每 2 小时)
0 */2 * * * cd /root/openclaw && ADSB_USE_PROXY=false python3 skills/intelligence/adsb_monitor.py > /tmp/adsb_latest.json 2>> /var/log/adsb_monitor.log

# Polymarket 信号生成 (每 2 小时，监控完成后 5 分钟)
5 */2 * * * cd /root/openclaw && python3 skills/intelligence/adsb_polymarket_signals.py > /tmp/adsb_signals.json 2>> /var/log/adsb_signals.log
```

### Systemd Timer (可选)

如需更复杂的调度逻辑，可以创建 systemd service + timer。

## 🔧 配置选项

### 代理设置

**默认**: 尝试使用 `socks5h://127.0.0.1:7880`

**禁用代理** (直连):
```bash
export ADSB_USE_PROXY=false
python3 skills/intelligence/adsb_monitor.py
```

**自定义代理**:
修改 `adsb_monitor.py` 中的 `PROXY` 字典。

### 调整监控参数

编辑 `adsb_monitor.py`:

```python
# 修改关键基地列表
KEY_BASES = {
    'Dover AFB': (39.13, -75.47, 50),  # (纬度, 经度, 半径km)
    # ... 添加更多
}

# 修改中东关注区域
MIDDLE_EAST_BOX = {
    'lamin': 12.0,
    'lamax': 42.0,
    'lomin': 34.0,
    'lomax': 63.0,
}

# 修改军用 callsign 列表
MILITARY_CALLSIGNS = [
    'RCH', 'CMB', 'SPAR',
    # ... 添加更多
]
```

### 调整威胁评分

编辑 `generate_intelligence_summary()` 函数中的评分逻辑:

```python
# 中东军机阈值
if me_count > 10:
    threat_score += 30
elif me_count > 5:
    threat_score += 15

# 基地活动阈值
if base_activity > 8:
    threat_score += 25
# ...
```

## 📊 输出格式说明

### 主报告 (adsb_monitor.py)

```json
{
  "timestamp": "2026-03-03T15:57:03Z",
  "threat_assessment": {
    "level": "MEDIUM",      // LOW/MEDIUM/HIGH
    "score": 35,            // 0-100
    "emoji": "🟡",          // 🟢🟡🔴
    "factors": [...]        // 威胁因素列表
  },
  "military_activity": {
    "total_military_aircraft": 1,
    "middle_east_region": 1,
    "base_activity": {...}
  },
  "iran_airspace": {
    "civilian_flights_over_iran": 3,
    ...
  },
  "notable_flights": [...]
}
```

### 交易信号 (adsb_polymarket_signals.py)

```json
{
  "timestamp": "...",
  "adsb_threat_score": 35,
  "signals": [
    {
      "market": "iran-conflict-escalation",
      "side": "YES",
      "confidence": "HIGH",
      "reason": "伊朗领空仅 3 架民航，可能绕飞",
      "size_pct": 8
    }
  ]
}
```

## ⚠️ 限制与注意事项

### OpenSky API 限制
- **免费层**: 400 次/天 (每次查询 1-4 credits)
- **当前配置**: 每 2 小时 = 12 次/天 << 400 次
- **仅当前状态**: 无历史趋势分析
- **区域查询**: 有面积限制

### 数据质量
- 军机可能关闭 ADS-B 转发器 (隐身模式)
- Callsign 识别可能遗漏非标准呼号
- 数据延迟 10-15 秒

### 代理问题
- 当前代理 (7880) 连接超时
- **建议**: 使用直连模式 (`ADSB_USE_PROXY=false`)
- 如需代理，检查 V2Ray/clash 服务状态

## 🔍 故障排除

### 问题: API 请求失败
```bash
# 检查网络
curl https://opensky-network.org/api/states/all | jq '.states | length'

# 检查代理 (如果使用)
systemctl status v2ray
netstat -tlnp | grep 7880
```

### 问题: 429 Too Many Requests
```bash
# 减少调用频率
# 当前 2 小时/次已经很保守，可能是其他程序也在调用

# 或注册 OpenSky 账号 (4000 次/天)
```

### 问题: 返回空数据
```bash
# 检查查询区域
# 中东地区可能某些时段确实没有军机

# 尝试全球查询
ADSB_USE_PROXY=false python3 skills/intelligence/adsb_monitor.py 2>&1 | grep "获取到"
```

### 问题: JSON 格式错误
```bash
# 查看完整输出
cat /tmp/adsb_latest.json

# 检查脚本错误
python3 -m py_compile skills/intelligence/adsb_monitor.py
```

## 📈 改进建议

### 短期
1. ✅ 基本监控功能
2. ✅ Polymarket 信号集成
3. ⏳ 添加数据持久化 (SQLite)
4. ⏳ 历史趋势分析 (24h/7d 对比)

### 中期
1. 注册 OpenSky 账号 (提高 API 限额)
2. 增加 FlightRadar24 API (民航数据交叉验证)
3. X (Twitter) 情报爬取集成
4. 自动化 Polymarket 交易执行

### 长期
1. 部署本地 ADS-B 接收器 (无限制)
2. 购买 ADS-B Exchange 商业授权 (unfiltered)
3. 机器学习模型 (预测军事行动)
4. 多源情报融合 (卫星图像 + 社交媒体)

## 🔗 相关资源

- **OpenSky API**: https://openskynetwork.github.io/opensky-api/
- **ADS-B Exchange**: https://www.adsbexchange.com/
- **军用 callsign**: https://en.wikipedia.org/wiki/List_of_U.S._Air_Force_installations
- **Polymarket Skill**: `/root/openclaw/skills/polymarket/SKILL.md`

## 📝 变更日志

### 2026-03-03
- ✅ 初始版本
- ✅ OpenSky Network API 集成
- ✅ 威胁评分系统
- ✅ Polymarket 信号生成器
- ✅ 代理支持 + 直连 fallback
- ⚠️ 当前代理 (7880) 超时，建议使用直连

---

**维护者**: OpenClaw Agent
**最后更新**: 2026-03-03
