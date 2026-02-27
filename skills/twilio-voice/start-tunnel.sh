#!/bin/bash
# Start SSH reverse tunnel to EC2

set -e

EC2_HOST="175.41.200.135"
EC2_USER="ec2-user"
SSH_KEY="/root/water3.pem"
LOCAL_PORT=8765
REMOTE_PORT=8765

echo "==================================="
echo "Starting SSH Reverse Tunnel"
echo "==================================="
echo "Local port:  $LOCAL_PORT"
echo "Remote port: $REMOTE_PORT"
echo "EC2 host:    $EC2_HOST"
echo "==================================="

# Check if tunnel already exists
if pgrep -f "ssh -R $REMOTE_PORT:localhost:$LOCAL_PORT" > /dev/null; then
    echo "⚠️  Tunnel already running. Killing existing process..."
    pkill -f "ssh -R $REMOTE_PORT:localhost:$LOCAL_PORT"
    sleep 2
fi

# Start tunnel in background
ssh -R $REMOTE_PORT:localhost:$LOCAL_PORT \
    -o ServerAliveInterval=60 \
    -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes \
    -o StrictHostKeyChecking=no \
    -i "$SSH_KEY" \
    "$EC2_USER@$EC2_HOST" \
    -N &

TUNNEL_PID=$!

echo "✓ Tunnel started (PID: $TUNNEL_PID)"
echo ""
echo "Webhook URL: http://$EC2_HOST:$REMOTE_PORT/voice"
echo ""
echo "To stop: kill $TUNNEL_PID"
echo ""

# Save PID for later
echo $TUNNEL_PID > /tmp/twilio-tunnel.pid
