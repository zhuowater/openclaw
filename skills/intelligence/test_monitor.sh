#!/bin/bash
# ADS-B 监控测试脚本
# 用于验证脚本功能和代理配置

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITOR_SCRIPT="$SCRIPT_DIR/adsb_monitor.py"

echo "🧪 ADS-B 监控脚本测试"
echo "===================="
echo ""

# 测试 1: 检查依赖
echo "1️⃣  检查 Python 依赖..."
python3 -c "import requests, socks" 2>/dev/null && echo "✅ 依赖已安装" || {
    echo "❌ 缺少依赖，请安装:"
    echo "   apt-get install python3-requests python3-socks"
    exit 1
}

# 测试 2: 测试直连 (无代理)
echo ""
echo "2️⃣  测试直连模式 (无代理)..."
if timeout 30 python3 "$MONITOR_SCRIPT" > /tmp/adsb_test.json 2>/tmp/adsb_test.log; then
    echo "✅ 直连成功"
    jq -r '.threat_assessment.emoji + " " + .threat_assessment.level + " (评分: " + (.threat_assessment.score|tostring) + "/100)"' /tmp/adsb_test.json 2>/dev/null || cat /tmp/adsb_test.json
else
    echo "❌ 直连失败，查看日志:"
    tail -10 /tmp/adsb_test.log
    exit 1
fi

# 测试 3: 测试代理 (如果配置)
echo ""
echo "3️⃣  测试代理模式..."
if nc -z 127.0.0.1 7880 2>/dev/null; then
    echo "🔐 代理端口 7880 可达，测试代理连接..."
    if timeout 30 sh -c 'ADSB_USE_PROXY=true python3 "$1" > /tmp/adsb_proxy_test.json 2>/tmp/adsb_proxy_test.log' -- "$MONITOR_SCRIPT"; then
        echo "✅ 代理模式成功"
    else
        echo "⚠️  代理模式失败 (超时/连接错误)，但直连可用"
        echo "   建议: 检查 SOCKS5 代理配置或使用直连模式"
    fi
else
    echo "⚠️  代理端口 7880 不可达，跳过代理测试"
    echo "   如需使用代理，请启动 V2Ray/clash 等服务"
fi

# 测试 4: 验证 JSON 输出格式
echo ""
echo "4️⃣  验证输出格式..."
if jq -e '.threat_assessment.level, .military_activity, .iran_airspace' /tmp/adsb_test.json >/dev/null 2>&1; then
    echo "✅ JSON 格式正确"
else
    echo "❌ JSON 格式错误"
    exit 1
fi

# 总结
echo ""
echo "===================="
echo "✅ 所有测试通过！"
echo ""
echo "📋 最新报告:"
cat /tmp/adsb_test.log | grep "^🎯\|^✈️\|^🎖️\|^🇮🇷"
echo ""
echo "📁 完整输出: /tmp/adsb_test.json"
echo ""
echo "🔄 添加到 cron (每 2 小时):"
echo "   0 */2 * * * cd $SCRIPT_DIR/.. && ADSB_USE_PROXY=false python3 skills/intelligence/adsb_monitor.py > /tmp/adsb_latest.json 2>> /var/log/adsb_monitor.log"
