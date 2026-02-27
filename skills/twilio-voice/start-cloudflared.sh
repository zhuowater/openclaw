#!/bin/bash
# Alternative: Use cloudflared tunnel (no account needed)

set -e

PORT=8765
COMMAND="cloudflared tunnel --url http://localhost:$PORT"

echo "==================================="
echo "Cloudflared Tunnel (Alternative to SSH)"
echo "==================================="
echo "Installing cloudflared if needed..."

if ! command -v cloudflared &> /dev/null; then
    echo "📦 Installing cloudflared..."
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    sudo dpkg -i cloudflared-linux-amd64.deb || sudo apt-get install -f -y
    rm cloudflared-linux-amd64.deb
fi

echo "✓ Cloudflared installed"
echo ""
echo "🚀 Starting tunnel on port $PORT..."
echo ""

$COMMAND
