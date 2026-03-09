#!/bin/bash
# FIFA 世界杯赔率套利快速扫描脚本

SCRIPT_DIR="/root/openclaw/skills/intelligence"
SCANNER="$SCRIPT_DIR/fifa_odds_scanner.py"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 FIFA 2026 世界杯赔率套利扫描器${NC}"
echo ""

# 检查脚本是否存在
if [ ! -f "$SCANNER" ]; then
    echo -e "${RED}❌ 错误: 找不到扫描器 $SCANNER${NC}"
    exit 1
fi

# 执行扫描
python3 "$SCANNER"

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ 扫描成功完成${NC}"
    
    # 显示最新的 JSON 报告路径
    LATEST_REPORT=$(ls -t $SCRIPT_DIR/fifa_odds_*.json 2>/dev/null | head -1)
    if [ -n "$LATEST_REPORT" ]; then
        echo -e "${YELLOW}📄 JSON 报告: $LATEST_REPORT${NC}"
    fi
else
    echo ""
    echo -e "${RED}❌ 扫描失败 (exit code: $EXIT_CODE)${NC}"
    exit $EXIT_CODE
fi
