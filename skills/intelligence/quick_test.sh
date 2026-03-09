#!/bin/bash
# ADS-B 监控快速测试 (仅直连模式)

cd /root/openclaw
echo "🛰️  运行 ADS-B 监控脚本..."
ADSB_USE_PROXY=false python3 skills/intelligence/adsb_monitor.py 2>&1 | tee /tmp/adsb_latest_run.log

echo ""
echo "✅ 完成！输出已保存到 /tmp/adsb_latest_run.log"
