#!/usr/bin/env node
/**
 * Twilio Voice Call Server
 * Handles incoming calls and WebSocket connections to OpenAI Realtime API
 */

require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const WebSocket = require('ws');
const twilio = require('twilio');

const app = express();
const server = createServer(app);
const wss = new WebSocket.Server({ server });

// Config
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'twilio-voice-call' });
});

// Incoming call webhook
app.post('/twilio/voice/incoming', (req, res) => {
  const { CallSid, From, To } = req.body;
  console.log(`📞 Incoming call: ${From} → ${To} (${CallSid})`);

  const twiml = new twilio.twiml.VoiceResponse();
  
  // Connect to WebSocket for real-time audio streaming
  const connect = twiml.connect();
  connect.stream({
    url: `wss://${req.hostname}/media-stream`,
    parameters: {
      callSid: CallSid,
      from: From
    }
  });

  // Keep call alive while streaming
  twiml.pause({ length: 300 });

  res.type('text/xml');
  res.send(twiml.toString());
});

// WebSocket: Twilio Media Stream → OpenAI Realtime API
wss.on('connection', (ws) => {
  console.log('🔌 Twilio media stream connected');
  let openaiWs = null;
  let streamSid = null;

  ws.on('message', async (message) => {
    const data = JSON.parse(message);

    switch (data.event) {
      case 'start':
        streamSid = data.start.streamSid;
        console.log(`🎬 Stream started: ${streamSid}`);
        
        // Connect to OpenAI Realtime API
        openaiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'OpenAI-Beta': 'realtime=v1'
          }
        });

        openaiWs.on('open', () => {
          console.log('✅ OpenAI Realtime API connected');
          // Configure session
          openaiWs.send(JSON.stringify({
            type: 'session.update',
            session: {
              modalities: ['text', 'audio'],
              instructions: '你是一个友好的 AI 助手，通过电话与用户对话。请用中文回复。',
              voice: 'alloy',
              input_audio_format: 'g711_ulaw',
              output_audio_format: 'g711_ulaw',
              input_audio_transcription: { model: 'whisper-1' },
              turn_detection: { type: 'server_vad' }
            }
          }));
        });

        openaiWs.on('message', (openaiMessage) => {
          const response = JSON.parse(openaiMessage);
          
          // Forward audio back to Twilio
          if (response.type === 'response.audio.delta' && response.delta) {
            ws.send(JSON.stringify({
              event: 'media',
              streamSid: streamSid,
              media: { payload: response.delta }
            }));
          }

          if (response.type === 'response.audio_transcript.done') {
            console.log(`🤖 AI said: ${response.transcript}`);
          }
        });

        openaiWs.on('error', (error) => {
          console.error('❌ OpenAI error:', error);
        });

        openaiWs.on('close', () => {
          console.log('🔌 OpenAI connection closed');
        });
        break;

      case 'media':
        // Forward audio from Twilio to OpenAI
        if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
          openaiWs.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: data.media.payload
          }));
        }
        break;

      case 'stop':
        console.log('🛑 Stream stopped');
        if (openaiWs) {
          openaiWs.close();
        }
        break;
    }
  });

  ws.on('close', () => {
    console.log('📴 Twilio media stream closed');
    if (openaiWs) {
      openaiWs.close();
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Twilio Voice Server running on port ${PORT}`);
  console.log(`📞 Incoming call webhook: http://localhost:${PORT}/twilio/voice/incoming`);
  console.log(`🔌 Media stream endpoint: ws://localhost:${PORT}/media-stream`);
});
