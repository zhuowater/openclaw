---
name: firms-satellite
description: NASA FIRMS 卫星火点检测与分析。监控全球任意区域的火灾/爆炸/热异常，验证军事打击、自然灾害等事件。支持自定义战略目标监控。用于战场情报、灾害响应、能源设施监控等场景。
---

# NASA FIRMS Satellite Fire Detection

通过 NASA FIRMS (Fire Information for Resource Management System) API 获取近实时卫星热异常数据（VIIRS/MODIS 传感器），分析全球任意区域的火点分布。

## 能力

- 🛰️ **近实时火点检测**：3-4 小时延迟（美国/加拿大 <1 分钟）
- 🎯 **战略目标关联**：自动匹配火点与已知军事/工业/核设施
- 📊 **能量分析**：FRP (Fire Radiative Power) 区分正常燃烧 vs 爆炸
- 🌍 **全球覆盖**：任意经纬度 bounding box
- 📈 **多传感器**：VIIRS S-NPP、VIIRS NOAA-20/21、MODIS

## 配置

API Key 存储在 `/root/openclaw/.env`：
```
FIRMS_MAP_KEY=<your_key>
```

免费注册：https://firms.modaps.eosdis.nasa.gov/api/map_key/
限额：5000 次/10 分钟

## 使用

### 1. 快速扫描指定区域

```bash
# 伊朗区域（预置战略目标）
python3 /root/openclaw/skills/firms-satellite/scripts/firms_scan.py --region iran

# 自定义 bounding box (west,south,east,north)
python3 /root/openclaw/skills/firms-satellite/scripts/firms_scan.py --bbox 44,25,64,40

# 指定天数（1-5）
python3 /root/openclaw/skills/firms-satellite/scripts/firms_scan.py --region iran --days 3

# 指定传感器
python3 /root/openclaw/skills/firms-satellite/scripts/firms_scan.py --region iran --source VIIRS_NOAA20_NRT
```

### 2. 自定义目标监控

```bash
# 添加自定义监控目标
python3 /root/openclaw/skills/firms-satellite/scripts/firms_scan.py \
  --region iran \
  --target "My Target:35.69,51.39,10"  # name:lat,lon,radius_km
```

### 3. JSON 输出（供程序使用）

```bash
python3 /root/openclaw/skills/firms-satellite/scripts/firms_scan.py --region iran --json
```

## 预置区域

| Region | BBox | 包含目标 |
|--------|------|---------|
| `iran` | 44,25,64,40 | 15 个核/军事/石油设施 |
| `ukraine` | 22,44,40,53 | 待配置 |
| `taiwan` | 119,21,123,26 | 待配置 |
| `mideast` | 34,12,64,42 | 全中东 |

## 输出解读

- **FRP (MW)**：火辐射功率。>50MW = 大型火灾/爆炸；>100MW = 极端事件
- **Confidence**：h=高、n=正常、l=低
- **bright_ti4 (K)**：亮温。367K = 传感器饱和 = 极高温
- **距离目标 <5km** = 高度关联；<20km = 需关注；>20km = 可能无关

## 注意事项

- 数据有 3-4 小时延迟，不是真正的"实时"
- 石油/天然气设施日常也有火点（flaring），需要对比历史基线
- 云层遮挡会导致漏检
- 单次检测可能是噪声，持续多次检测才可靠
