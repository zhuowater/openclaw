#!/bin/bash
# 端到端测试：生成图片 + 发送到飞书

set -e

echo "🎨 第一步：生成图片..."
cd /root/clawd/skills/image-generate
OUTPUT=$(python3 scripts/image_generate.py "$1" 2>&1 | tee /dev/tty | grep -o 'generated_image_[0-9_]*\.png' | head -1)

if [ -z "$OUTPUT" ]; then
  echo "❌ 图片生成失败"
  exit 1
fi

IMAGE_PATH="/root/clawd/skills/image-generate/$OUTPUT"
echo "✅ 图片已生成: $IMAGE_PATH"

echo ""
echo "📤 第二步：发送到飞书..."
cd /root/clawd/skills/feishu-media

# 获取 token（2小时有效期）
TOKEN=$(curl -s -X POST 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal' \
  -H 'Content-Type: application/json' \
  -d '{
    "app_id": "cli_a9f68bf64bf9dbde",
    "app_secret": "Blvo5l76nUkYvcyqw5YfPcdUD1GBYebi"
  }' | jq -r '.tenant_access_token')

export FEISHU_BOT_TOKEN="$TOKEN"

# 发送图片
node send-media.js "$IMAGE_PATH" "${2:-ou_db3e9415ff1c7418c317b6cdfdf1ef0d}"

echo ""
echo "🎉 全部完成！"
