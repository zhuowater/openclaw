#!/bin/bash
# Evolver Full Auto - 完整自动进化流程
# 1. 运行 evolver 扫描
# 2. 读取生成的 GEP 提示词
# 3. 输出最新提示词路径供 agent 使用

set -e
cd /root/openclaw/skills/evolver

echo "=== Evolver Full Auto ==="
echo "Time: $(date -Is)"

# 运行 evolver 扫描
echo "[1/3] Running evolver scan..."
node index.js run 2>&1 | grep -E "(Signals|Selection|BRIDGE|sessions_spawn|Scanning|SearchFirst)" || true

# 找到最新的 GEP 提示词
echo "[2/3] Finding latest GEP prompt..."
LATEST_PROMPT=$(ls -t /root/openclaw/memory/evolution/gep_prompt_*.txt 2>/dev/null | head -1)

if [ -z "$LATEST_PROMPT" ]; then
  echo "ERROR: No GEP prompt found"
  exit 1
fi

echo "Latest prompt: $LATEST_PROMPT"

# 提取信号摘要
echo "[3/3] Signal summary:"
grep -o '"signals": \[.*\]' "$LATEST_PROMPT" | head -1 || \
  grep "Context \[Signals\]" "$LATEST_PROMPT" | head -1

echo ""
echo "PROMPT_FILE=$LATEST_PROMPT"
echo "=== Scan complete ==="
