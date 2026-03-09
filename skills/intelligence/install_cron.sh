#!/bin/bash
# ADS-B 监控 Cron 自动安装脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

echo "🛰️  ADS-B 监控 Cron 安装"
echo "========================"
echo ""
echo "项目目录: $PROJECT_ROOT"
echo ""

# 检查依赖
echo "1️⃣  检查依赖..."
if ! python3 -c "import requests, socks" 2>/dev/null; then
    echo "❌ 缺少 Python 依赖"
    echo "   安装命令: apt-get install python3-requests python3-socks"
    exit 1
fi
echo "✅ 依赖已安装"

# 测试脚本
echo ""
echo "2️⃣  测试脚本运行..."
if timeout 30 sh -c "cd '$PROJECT_ROOT' && ADSB_USE_PROXY=false python3 skills/intelligence/adsb_monitor.py > /tmp/adsb_cron_test.json 2>/dev/null"; then
    echo "✅ 脚本运行成功"
else
    echo "❌ 脚本运行失败"
    exit 1
fi

# 创建日志目录
echo ""
echo "3️⃣  创建日志目录..."
mkdir -p /var/log
touch /var/log/adsb_monitor.log
touch /var/log/adsb_signals.log
chmod 644 /var/log/adsb_monitor.log /var/log/adsb_signals.log
echo "✅ 日志文件已创建"

# 生成 crontab 条目
CRON_ENTRY_1="0 */2 * * * cd $PROJECT_ROOT && ADSB_USE_PROXY=false python3 skills/intelligence/adsb_monitor.py > /tmp/adsb_latest.json 2>> /var/log/adsb_monitor.log"
CRON_ENTRY_2="5 */2 * * * cd $PROJECT_ROOT && python3 skills/intelligence/adsb_polymarket_signals.py > /tmp/adsb_signals.json 2>> /var/log/adsb_signals.log"

echo ""
echo "4️⃣  检查现有 crontab..."
if crontab -l 2>/dev/null | grep -q "adsb_monitor.py"; then
    echo "⚠️  检测到现有 ADS-B cron 任务"
    read -p "   是否覆盖? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ 已取消"
        exit 0
    fi
    # 移除旧任务
    crontab -l 2>/dev/null | grep -v "adsb_monitor.py\|adsb_polymarket_signals.py" | crontab -
fi

# 安装 cron 任务
echo ""
echo "5️⃣  安装 cron 任务..."
(crontab -l 2>/dev/null || true; echo ""; echo "# ADS-B 军事航班监控"; echo "$CRON_ENTRY_1"; echo "$CRON_ENTRY_2") | crontab -
echo "✅ Cron 任务已安装"

# 验证
echo ""
echo "6️⃣  验证安装..."
echo ""
crontab -l | grep -A 2 "ADS-B 军事航班监控" || echo "❌ 未找到 cron 任务"

echo ""
echo "========================"
echo "✅ 安装完成！"
echo ""
echo "📅 调度计划:"
echo "   • ADS-B 监控: 每 2 小时 (输出到 /tmp/adsb_latest.json)"
echo "   • 信号生成: 每 2 小时 (监控后 5 分钟，输出到 /tmp/adsb_signals.json)"
echo ""
echo "📋 日志文件:"
echo "   • /var/log/adsb_monitor.log"
echo "   • /var/log/adsb_signals.log"
echo ""
echo "🔍 管理命令:"
echo "   查看 crontab:    crontab -l"
echo "   编辑 crontab:    crontab -e"
echo "   查看日志:        tail -f /var/log/adsb_monitor.log"
echo "   手动运行:        bash $SCRIPT_DIR/quick_test.sh"
echo ""
echo "⏰ 下次运行: $(date -d '2 hours' '+%Y-%m-%d %H:00:00')"
