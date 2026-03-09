# ADS-B 军事航班监控 - 快速参考

## 🚀 一键运行

```bash
bash /root/openclaw/skills/intelligence/quick_test.sh
```

## 📊 查看结果

```bash
# 简要报告
tail -20 /tmp/adsb_latest_run.log | grep "🎯\|✈️\|🇮🇷"

# 完整 JSON
jq . /tmp/adsb_latest.json
```

## 🤖 生成交易信号

```bash
# 1. 运行监控
ADSB_USE_PROXY=false python3 skills/intelligence/adsb_monitor.py > /tmp/adsb_latest.json

# 2. 生成信号
python3 skills/intelligence/adsb_polymarket_signals.py
```

## ⏰ 自动化 (Cron)

```bash
# 安装 (每 2 小时)
bash /root/openclaw/skills/intelligence/install_cron.sh

# 查看状态
crontab -l | grep adsb

# 查看日志
tail -f /var/log/adsb_monitor.log
```

## 🎯 输出说明

| 威胁等级 | 评分 | 标记 | 含义 |
|---------|------|------|------|
| LOW | 0-29 | 🟢 | 正常活动 |
| MEDIUM | 30-59 | 🟡 | 活动增加 |
| HIGH | 60-100 | 🔴 | 显著异常 |

## 📂 文件位置

| 文件 | 说明 |
|------|------|
| `/root/openclaw/skills/intelligence/adsb_monitor.py` | 核心监控脚本 |
| `/root/openclaw/skills/intelligence/adsb_polymarket_signals.py` | 信号生成器 |
| `/tmp/adsb_latest.json` | 最新监控结果 |
| `/tmp/adsb_signals.json` | 最新交易信号 |
| `/var/log/adsb_monitor.log` | 监控日志 |

## ⚠️ 故障排除

**问题**: API 请求失败
```bash
curl https://opensky-network.org/api/states/all | jq '.states | length'
```

**问题**: 429 Too Many Requests
- 当前配置: 12 次/天 << 400 次限制
- 检查是否有其他程序也在调用

**问题**: 代理超时
- 使用直连模式: `ADSB_USE_PROXY=false`
- 检查代理状态: `netstat -tlnp | grep 7880`

## 🔗 文档

- 详细文档: `/root/openclaw/skills/intelligence/SKILL.md`
- 部署指南: `/root/openclaw/skills/intelligence/README_DEPLOY.md`
- 完成报告: `/root/openclaw/skills/intelligence/COMPLETION_REPORT.md`

---

**快速示例**:
```bash
# 运行一次
cd /root/openclaw
ADSB_USE_PROXY=false python3 skills/intelligence/adsb_monitor.py > /tmp/adsb.json

# 查看威胁评分
jq -r '.threat_assessment.emoji + " " + .threat_assessment.level + " (" + (.threat_assessment.score|tostring) + "/100)"' /tmp/adsb.json

# 生成信号
python3 skills/intelligence/adsb_polymarket_signals.py | jq '.signals'
```
