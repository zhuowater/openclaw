const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 8765;

// Twilio credentials
const TWILIO_ACCOUNT_SID = 'AC1cd31002d32cd4e317c993f3bb763f2b';
const TWILIO_AUTH_TOKEN = 'd0fa773cb08ce71c99cf7222566b6125';
const TWILIO_PHONE = '+18305212085';

// API Keys
const SKYEYE_API_KEY = process.env.SKYEYE_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Session store (in-memory, could use Redis for production)
const sessions = new Map();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initial call webhook - Twilio calls this when connection is made
app.post('/voice', async (req, res) => {
  const callSid = req.body.CallSid;
  const from = req.body.From;
  
  console.log(`[${new Date().toISOString()}] New call from ${from}, CallSid: ${callSid}`);
  
  // Initialize session
  sessions.set(callSid, {
    from,
    history: [],
    startTime: Date.now()
  });
  
  const twiml = new twilio.twiml.VoiceResponse();
  
  // Welcome message
  twiml.say({ 
    voice: 'Polly.Zhiyu', 
    language: 'cmn-CN' 
  }, '你好！我是AI助手。请问有什么可以帮你的吗？');
  
  // Gather user speech
  const gather = twiml.gather({
    input: 'speech',
    language: 'zh-CN',
    speechTimeout: 'auto',
    action: '/gather',
    method: 'POST'
  });
  
  // If no speech detected
  twiml.say({ 
    voice: 'Polly.Zhiyu', 
    language: 'cmn-CN' 
  }, '没有听到你的声音。再见！');
  
  res.type('text/xml');
  res.send(twiml.toString());
});

// Gather webhook - handles user speech
app.post('/gather', async (req, res) => {
  const callSid = req.body.CallSid;
  const speechResult = req.body.SpeechResult;
  const confidence = req.body.Confidence;
  
  console.log(`[${new Date().toISOString()}] Speech received: "${speechResult}" (confidence: ${confidence})`);
  
  const session = sessions.get(callSid);
  if (!session) {
    console.error(`Session not found for CallSid: ${callSid}`);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({ voice: 'Polly.Zhiyu', language: 'cmn-CN' }, '抱歉，会话已过期。请重新拨打。');
    twiml.hangup();
    res.type('text/xml');
    return res.send(twiml.toString());
  }
  
  // Add user message to history
  session.history.push({
    role: 'user',
    content: speechResult
  });
  
  try {
    // Get AI response
    const aiResponse = await getAIResponse(session.history);
    console.log(`[${new Date().toISOString()}] AI response: "${aiResponse}"`);
    
    // Add AI response to history
    session.history.push({
      role: 'assistant',
      content: aiResponse
    });
    
    // Create TwiML response
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Say AI response
    twiml.say({ 
      voice: 'Polly.Zhiyu', 
      language: 'cmn-CN' 
    }, aiResponse);
    
    // Continue gathering
    const gather = twiml.gather({
      input: 'speech',
      language: 'zh-CN',
      speechTimeout: 'auto',
      action: '/gather',
      method: 'POST'
    });
    
    // Timeout message
    twiml.say({ 
      voice: 'Polly.Zhiyu', 
      language: 'cmn-CN' 
    }, '感谢你的来电。再见！');
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error:`, error.message);
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({ 
      voice: 'Polly.Zhiyu', 
      language: 'cmn-CN' 
    }, '抱歉，我遇到了一些技术问题。请稍后再试。');
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Call status callback
app.post('/status', (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;
  
  console.log(`[${new Date().toISOString()}] Call ${callSid} status: ${callStatus}`);
  
  if (callStatus === 'completed') {
    const session = sessions.get(callSid);
    if (session) {
      const duration = Math.floor((Date.now() - session.startTime) / 1000);
      console.log(`Call completed. Duration: ${duration}s, Messages: ${session.history.length}`);
      sessions.delete(callSid);
    }
  }
  
  res.sendStatus(200);
});

// Get AI response using Skyeye API
async function getAIResponse(history) {
  const messages = [
    {
      role: 'system',
      content: '你是一个友好的中文AI助手，正在电话通话中。回复要简短自然，像电话聊天一样。每次回复控制在2-3句话以内，不要太长。语气要亲切、口语化。'
    },
    ...history
  ];
  
  try {
    const response = await axios.post(
      'https://api.skyeye.net/v1/chat/completions',
      {
        model: 'claude-sonnet-4-5-20250929',
        messages: messages,
        max_tokens: 150,
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${SKYEYE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('AI API Error:', error.response?.data || error.message);
    throw new Error('Failed to get AI response');
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================`);
  console.log(`Twilio Voice AI Server`);
  console.log(`=================================`);
  console.log(`Port: ${PORT}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`=================================`);
  console.log(`Endpoints:`);
  console.log(`  POST /voice   - Initial call webhook`);
  console.log(`  POST /gather  - Speech input handler`);
  console.log(`  POST /status  - Call status updates`);
  console.log(`  GET  /health  - Health check`);
  console.log(`=================================`);
});
