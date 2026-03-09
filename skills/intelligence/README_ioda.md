# IODA Internet Outage Monitor

监控伊朗及其代理人网络(黎巴嫩/叙利亚/也门/伊拉克)的互联网连通性变化，用于情报分析。

## 功能

- **多国监控**: 同时监控 IR, LB, SY, YE, IQ 五国
- **三重信号**: BGP, Active Probing, Google Transparency
- **异常检测**: 基于统计 z-score 检测连通性异常下降
- **协调分析**: 检测多国在 1 小时内的同步中断事件
- **双重输出**: JSON (stdout) + 人类可读报告 (stderr)

## 使用方法

### 基础运行
```bash
python3 /root/openclaw/skills/intelligence/ioda_monitor.py
```

### 保存 JSON 数据
```bash
python3 ioda_monitor.py > iran_outage_$(date +%Y%m%d).json
```

### 查看报告
```bash
python3 ioda_monitor.py 2>&1 | grep -A 200 "IODA INTERNET"
```

### 仅查看异常
```bash
python3 ioda_monitor.py 2>&1 | grep -E "(CRITICAL|WARNING|Anomalies detected)"
```

## 输出解读

### 状态级别
- **🟢 normal**: 无显著异常
- **🟡 warning**: 检测到轻度异常 (z-score < -2)
- **🔴 critical**: 检测到严重异常 (z-score < -3)

### 情报含义
- **伊朗断网** → 可能的军事行动或国内动荡
- **代理人网络断网** → 通信切断或定点打击
- **多国同时断网** → 协调行动/区域性事件

### 协调事件示例
```json
{
  "timestamp": 1771957800,
  "datetime": "2026-02-25T02:30:00",
  "countries": ["LB", "SY"],
  "country_names": ["Lebanon", "Syria"],
  "signal_count": 7,
  "interpretation": "Coordinated disruption detected across multiple proxy networks"
}
```

## 数据源

- **IODA API**: https://api.ioda.inetintel.cc.gatech.edu/v2/
- **数据提供**: Georgia Tech Internet Intelligence Lab
- **更新频率**: 5-30 分钟 (取决于信号类型)
- **历史数据**: 7 天回溯

## 技术细节

### 异常检测算法
1. 计算 7 天基线均值和标准差
2. 对每个数据点计算 z-score: `(value - mean) / stdev`
3. 标记 z-score < -2 为异常 (< -3 为严重)

### 监控国家
- **IR** (Iran): 核心监控目标
- **LB** (Lebanon): 真主党
- **SY** (Syria): 阿萨德政权 + 亲伊朗民兵
- **YE** (Yemen): 胡塞武装
- **IQ** (Iraq): 什叶派民兵

### 信号类型
- **BGP**: 边界网关协议路由可见性
- **Active Probing**: ICMP ping 响应率
- **Google Transparency**: 用户流量统计

## 集成建议

### Cron 定时任务
```bash
# 每小时运行，保存 JSON
0 * * * * cd /root/openclaw/skills/intelligence && python3 ioda_monitor.py > /tmp/ioda_latest.json 2>&1
```

### 告警集成
```bash
# 检测到 critical 时发送通知
python3 ioda_monitor.py 2>&1 | grep "CRITICAL" && \
  echo "Iran network disruption detected" | mail -s "IODA Alert" user@example.com
```

### Heartbeat 集成
在 HEARTBEAT.md 中添加:
```markdown
### IODA Monitor (每小时)
- 运行 ioda_monitor.py
- 如有 critical 状态，通知主代理
- 记录协调事件到 intelligence log
```

## 限制

- API 免费但有速率限制 (建议间隔 ≥30 分钟)
- 部分国家数据可能不完整 (战区、审查)
- 异常检测仅基于统计，需人工判读
- Null 值会被跳过，可能影响小样本国家

## 示例输出

```
================================================================================
IODA INTERNET OUTAGE MONITOR - IRAN & PROXY NETWORKS
================================================================================
Report generated: 2026-03-04T00:00:53

SUMMARY
--------------------------------------------------------------------------------
🔴 CRITICAL: Iran, Lebanon, Syria, Yemen, Iraq

COORDINATED EVENTS
--------------------------------------------------------------------------------
Time: 2026-02-25T02:30:00
Countries: Lebanon, Syria
Signals affected: 7
Analysis: Coordinated disruption detected across multiple proxy networks

COUNTRY DETAILS
--------------------------------------------------------------------------------

Iran (IR)
Status: WARNING
  bgp: mean=41070.01, latest=40961
  active_probing: mean=6401.01, latest=388
  google_transparency: mean=1605838170.74, latest=99168312
  Anomalies detected: 42
    - 2026-02-28T18:25:00: bgp (z-score: -2.5, severity: warning)
```

## 参考资料

- IODA 官网: https://ioda.inetintel.cc.gatech.edu/
- IODA Dashboard: https://ioda.inetintel.cc.gatech.edu/dashboard
- API 文档: https://api.ioda.inetintel.cc.gatech.edu/v2/docs
