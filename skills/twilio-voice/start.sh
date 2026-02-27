#!/bin/bash
# Production startup script

set -e

cd "$(dirname "$0")"

echo "==================================="
echo "Starting Twilio Voice AI Server"
echo "==================================="

# Check environment variables
if [ -z "$SKYEYE_API_KEY" ]; then
    echo "❌ SKYEYE_API_KEY not set!"
    exit 1
fi

echo "✓ Environment variables OK"

# Check dependencies
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "✓ Dependencies OK"

# Start server
echo "🚀 Starting server on port ${PORT:-8765}..."
exec node server.js
