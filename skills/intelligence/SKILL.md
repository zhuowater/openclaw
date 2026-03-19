---
name: intelligence
description: 多源情报聚合系统，为 Polymarket 交易提供数据驱动的信号。聚合 FIRMS卫星、GDELT事件、USGS地震等多源数据。触发词：情报分析、intelligence、交易信号、多源情报。
---

# Intelligence Trading Suite

多源情报聚合系统，为 Polymarket 交易提供数据驱动的信号。

## 核心原则

**每个数据源是一个棱镜，从多个角度分析：**
- ADS-B: 不只看战区上空 → 看美国本土→中东的运输机节奏
- AIS: 不只看霍尔木兹 → 看好望角绕行增量
- IODA: 不只看伊朗 → 看代理人网络(黎巴嫩/叙利亚/也门)状态
- VIIRS: 不只看火点 → 看城市夜光=电网完整性
- FIRMS: 不只看军事目标 → 看石油/工业基础设施

## 管道清单

| 管道 | 脚本 | 数据源 | 更新频率 |
|------|------|--------|----------|
| IODA 互联网 | ioda_monitor.py | Georgia Tech IODA API | 每6h |
| VIIRS 夜光 | viirs_nightlights.py | NASA GIBS (无需认证) | 每日 |
| ADS-B 航班 | adsb_monitor.py | OpenSky Network (免费) | 每4h |
| Trump 演讲 | trump_speech_monitor.py | WH/Factbase/Truth Social | 每日 |
| FIFA 赔率 | fifa_odds_scanner.py | 博彩公司赔率 | 每日 |
| AIS 航运 | ais_rerouting.py | VesselFinder/MarineTraffic | 每6h |
| Sentinel-2 | sentinel2_download.py | Copernicus (需认证) | 每5天 |
| FIRMS 火点 | ../firms-satellite/ | NASA FIRMS | 实时 |

## 使用方法

### 一键运行所有管道
```bash
bash /root/openclaw/skills/intelligence/run_all.sh
```

### 运行单个管道
```bash
bash /root/openclaw/skills/intelligence/run_all.sh ioda
bash /root/openclaw/skills/intelligence/run_all.sh viirs
bash /root/openclaw/skills/intelligence/run_all.sh adsb
bash /root/openclaw/skills/intelligence/run_all.sh trump
bash /root/openclaw/skills/intelligence/run_all.sh fifa
```

### Sentinel-2 卫星影像
```python
from sentinel2_download import get_token, download_image
token = get_token()  # Copernicus OAuth
download_image(lat, lon, delta, "2026-03-03", "/tmp/output.jpg", token)
```

### FIRMS 火点 (已有独立 skill)
```bash
# 参考 /root/openclaw/skills/firms-satellite/SKILL.md
# API key: e4b715bb6e6eeec9290fbd19fef9efe6
```

## 认证信息

| 服务 | 认证方式 |
|------|----------|
| Copernicus | zhuowater@gmail.com (OAuth) |
| FIRMS | API key e4b715bb... |
| OpenSky | 匿名(限速) |
| IODA | 无需认证 |
| NASA GIBS | 无需认证 |

## 报告输出

所有管道输出 JSON 到 `/root/openclaw/skills/intelligence/` 目录:
- `ioda_report.json`
- `viirs_report.json` (或 /tmp/viirs/)
- `adsb_report_*.json`
- `trump_third_term_report_*.json`
- `fifa_odds_*.json`
- `dashboard.json` (聚合)

## 交易信号逻辑

1. IODA 伊朗互联网恢复 > 50% → 可能停火信号
2. ADS-B 运输机频率翻倍 → 新一轮打击准备
3. VIIRS 城市灯光骤降 > 30% → 基础设施打击升级
4. FIRMS 新高能火点(>50MW) → 战略目标被打击
5. FIFA 博彩 vs PM 差异 > 5% → 套利机会
6. Trump 提到 "third term" 频率上升 → 加仓信号

## 代理设置

需要代理的: ADS-B, AIS, 博彩网站
不需要代理的: NASA (GIBS, FIRMS), IODA, Copernicus
代理地址: socks5h://127.0.0.1:7880
