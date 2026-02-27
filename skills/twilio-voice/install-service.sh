#!/bin/bash
# Install as systemd service

set -e

SERVICE_FILE="twilio-voice.service"
INSTALL_PATH="/etc/systemd/system/$SERVICE_FILE"

echo "Installing Twilio Voice AI as systemd service..."

# Copy service file
sudo cp "$SERVICE_FILE" "$INSTALL_PATH"

# Reload systemd
sudo systemctl daemon-reload

# Enable service
sudo systemctl enable twilio-voice

echo "✓ Service installed!"
echo ""
echo "Usage:"
echo "  sudo systemctl start twilio-voice    # Start service"
echo "  sudo systemctl stop twilio-voice     # Stop service"
echo "  sudo systemctl status twilio-voice   # Check status"
echo "  sudo journalctl -u twilio-voice -f   # View logs"
