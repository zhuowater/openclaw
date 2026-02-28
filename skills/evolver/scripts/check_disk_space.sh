#!/bin/bash
# 磁盘空间检查脚本 (GEP Cycle #0016)
THRESHOLD=${1:-80}
USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')

if [ "$USAGE" -ge "$THRESHOLD" ]; then
    echo "⚠️ 磁盘使用率: ${USAGE}% (阈值: ${THRESHOLD}%)"
    # Show top space consumers
    echo "Top 5 space consumers:"
    du -sh /root/openclaw/skills/*/  2>/dev/null | sort -rh | head -5
    exit 1
else
    echo "✅ 磁盘使用率: ${USAGE}%"
    exit 0
fi
