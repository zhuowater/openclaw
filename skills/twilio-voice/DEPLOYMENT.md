# Deployment Guide

## Current Status
✅ Local server working perfectly
✅ AI conversation flow tested
⚠️ EC2 SSH tunnel needs troubleshooting

## Deployment Options

### Option 1: SSH Reverse Tunnel to EC2 (Recommended)
```bash
# Start tunnel
./start-tunnel.sh

# Verify
curl http://175.41.200.135:8765/health
```

**If SSH fails:**
1. Check EC2 security group allows port 8765
2. Verify SSH key permissions: `chmod 600 /root/water3.pem`
3. Check EC2 sshd_config allows GatewayPorts

### Option 2: ngrok (Quick alternative)
```bash
# Install ngrok if not present
wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
tar xvzf ngrok-v3-stable-linux-amd64.tgz
sudo mv ngrok /usr/local/bin/

# Start tunnel
ngrok http 8765

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
# Use that as your Twilio webhook
```

### Option 3: Direct EC2 Deployment
Deploy the server directly on EC2 instead of tunneling:

```bash
# On EC2
git clone <this repo>
cd twilio-voice
npm install
node server.js

# Configure Twilio webhook to: http://175.41.200.135:8765/voice
```

## Making a Real Call

Once your server is publicly accessible:

```bash
# Update webhook URL if needed
./make-call.sh +13239037711
```

Or configure Twilio phone number:
1. Go to Twilio Console
2. Phone Numbers → Active Numbers
3. Select +18305212085
4. Voice Configuration:
   - A CALL COMES IN: Webhook, POST, http://YOUR_PUBLIC_URL:8765/voice
   - STATUS CALLBACK URL: http://YOUR_PUBLIC_URL:8765/status

## Troubleshooting

### EC2 SSH Issues
```bash
# Test basic connectivity
ping 175.41.200.135

# Test SSH key
ssh -i /root/water3.pem -v ec2-user@175.41.200.135

# Check key permissions
ls -la /root/water3.pem
chmod 600 /root/water3.pem
```

### Port Not Accessible
On EC2:
```bash
# Check if port is listening
sudo netstat -tlnp | grep 8765

# Check firewall
sudo iptables -L | grep 8765

# AWS Security Group should allow:
# - TCP 8765 from 0.0.0.0/0 (or Twilio IPs)
```

### Twilio Not Calling
1. Check webhook URL is publicly accessible
2. Verify Twilio phone number configuration
3. Check Twilio debugger: https://console.twilio.com/us1/monitor/logs/debugger
4. Ensure webhook returns valid TwiML

## Next Steps

1. **Fix EC2 SSH access** (priority)
2. **Test real phone call**
3. **Add HTTPS** (via nginx reverse proxy)
4. **Production hardening**:
   - Use Redis for sessions
   - Add request validation
   - Implement rate limiting
   - Add monitoring/logging
