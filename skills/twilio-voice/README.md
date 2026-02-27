# Twilio Voice AI - Real-time Phone Conversation System

AI-powered phone conversation system using Twilio + Claude AI. Call the bot and have a natural conversation in Chinese!

## 🎯 Features

- ✅ **Real-time voice conversation** - Natural back-and-forth dialogue
- ✅ **Chinese language support** - Native Chinese voice and understanding
- ✅ **Claude AI powered** - Intelligent, context-aware responses
- ✅ **No external STT needed** - Uses Twilio's built-in speech recognition
- ✅ **Simple HTTP webhooks** - No WebSocket complexity
- ✅ **Session management** - Maintains conversation context

## 🏗️ Architecture

```
User Phone ←→ Twilio (STT) ←→ HTTP Webhook ←→ Claude AI ←→ TwiML (TTS) ←→ User
```

### How it works:

1. User calls Twilio number
2. Twilio hits `/voice` webhook → Server responds with welcome message + `<Gather>`
3. User speaks → Twilio converts to text → POSTs to `/gather`
4. Server sends text to Claude AI → Gets response
5. Server returns TwiML with AI response + new `<Gather>`
6. Loop continues until hangup

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd /root/openclaw/skills/twilio-voice
npm install
```

### 2. Start Server
```bash
./start.sh
# Or manually:
node server.js
```

### 3. Expose to Public Internet

**Option A: SSH Tunnel to EC2**
```bash
./start-tunnel.sh
# Webhook URL: http://175.41.200.135:8765/voice
```

**Option B: ngrok**
```bash
ngrok http 8765
# Use the HTTPS URL as webhook
```

### 4. Test It!

**Local test (simulated):**
```bash
./test-conversation.sh
```

**Real phone call:**
```bash
./make-call.sh +1234567890  # Replace with your number
```

Or just dial: **+1 (830) 521-2085**

## 📁 Project Structure

```
twilio-voice/
├── server.js              # Main Express server
├── package.json           # Dependencies
├── start.sh               # Production startup script
├── start-tunnel.sh        # SSH tunnel to EC2
├── make-call.sh           # Programmatic call initiator
├── test-local.sh          # Local webhook test
├── test-conversation.sh   # Full conversation simulation
├── install-service.sh     # Install as systemd service
├── twilio-voice.service   # Systemd service file
├── SKILL.md               # Detailed documentation
├── DEPLOYMENT.md          # Deployment guide
└── README.md              # This file
```

## 🔧 Configuration

### Environment Variables
```bash
export SKYEYE_API_KEY="sk-..."  # Required for Claude AI
export PORT=8765                # Optional, defaults to 8765
```

### Twilio Configuration
- **Account SID:** AC1cd31002d32cd4e317c993f3bb763f2b
- **Phone Number:** +18305212085
- **Webhook URL:** http://YOUR_PUBLIC_URL:8765/voice
- **Status Callback:** http://YOUR_PUBLIC_URL:8765/status

## 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/voice` | POST | Initial call webhook (Twilio calls this) |
| `/gather` | POST | Speech input handler (Twilio posts transcription) |
| `/status` | POST | Call status updates |

## 🧪 Testing

### 1. Health Check
```bash
curl http://localhost:8765/health
```

### 2. Local Webhook Test
```bash
./test-local.sh
```

### 3. Full Conversation Simulation
```bash
./test-conversation.sh
```

### 4. Real Call Test
```bash
./make-call.sh +13239037711
```

## 🔒 Security Notes

⚠️ **For production:**
- Move credentials to environment variables (don't hardcode)
- Add Twilio signature validation
- Use HTTPS (nginx reverse proxy)
- Implement rate limiting
- Add request logging and monitoring

## 🐛 Troubleshooting

### Server won't start
```bash
# Check if port is in use
sudo netstat -tlnp | grep 8765

# Check environment variables
echo $SKYEYE_API_KEY
```

### Can't connect to EC2
```bash
# Test SSH
ssh -i /root/water3.pem ec2-user@175.41.200.135

# Check tunnel
pgrep -af "ssh -R"
```

### Twilio not calling webhook
1. Check webhook URL is publicly accessible: `curl http://YOUR_URL/health`
2. Check Twilio debugger: https://console.twilio.com/monitor/logs/debugger
3. Verify phone number configuration in Twilio console

### AI not responding
```bash
# Check logs
journalctl -u twilio-voice -f  # If using systemd
# Or
node server.js  # Run in foreground to see errors

# Test API directly
curl -X POST https://api.skyeye.net/v1/chat/completions \
  -H "Authorization: Bearer $SKYEYE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-5-20250929","messages":[{"role":"user","content":"test"}],"max_tokens":50}'
```

## 📊 System Status

**Current Status:** ✅ Fully functional (local testing)

**Tested:**
- ✅ Server startup
- ✅ Health endpoint
- ✅ Webhook flow (simulated)
- ✅ Claude AI integration
- ✅ Conversation context
- ✅ TwiML generation

**Pending:**
- ⏳ EC2 SSH tunnel (connection issues)
- ⏳ Real phone call test
- ⏳ Production deployment

## 🎨 Customization

### Change AI Model
Edit `server.js`:
```javascript
model: 'claude-sonnet-4-5-20250929',  // Change this
```

### Change Voice
Edit `server.js`:
```javascript
voice: 'Polly.Zhiyu',   // Chinese female
language: 'cmn-CN'
```

See [Twilio Voices](https://www.twilio.com/docs/voice/twiml/say/text-speech#available-voices-and-languages) for options.

### Adjust AI Behavior
Edit system prompt in `server.js`:
```javascript
{
  role: 'system',
  content: '你是一个...'  // Customize this
}
```

## 📈 Performance

- **Response time:** ~2-3 seconds (Claude API latency)
- **Concurrent calls:** Limited by single-process Node.js (add clustering for scale)
- **Session storage:** In-memory (use Redis for persistence)

## 🛣️ Roadmap

- [ ] Fix EC2 SSH tunnel
- [ ] Complete real phone test
- [ ] Add HTTPS with nginx
- [ ] Implement Redis session storage
- [ ] Add conversation summarization
- [ ] Support multiple languages
- [ ] Add user authentication
- [ ] Implement webhooks for events
- [ ] Add analytics dashboard

## 📝 License

Private project - All rights reserved

## 🙏 Credits

- **Twilio** - Voice infrastructure & STT
- **Claude (Anthropic)** - AI conversation engine
- **Skyeye** - Claude API proxy

---

**Questions?** Check `SKILL.md` for detailed docs or `DEPLOYMENT.md` for deployment guide.

**Last Updated:** 2026-02-27
