#!/bin/bash
# Test the voice webhook locally

echo "Testing /voice endpoint..."
curl -X POST http://localhost:8765/voice \
  -d "CallSid=TEST_CALL_001" \
  -d "From=+13239037711" \
  -d "To=+18305212085" \
  -d "CallStatus=ringing"

echo -e "\n\n================================\n"
echo "Testing /gather endpoint with speech..."
curl -X POST http://localhost:8765/gather \
  -d "CallSid=TEST_CALL_001" \
  -d "SpeechResult=你好，今天天气怎么样" \
  -d "Confidence=0.95"

echo -e "\n\n================================\n"
echo "Testing /status endpoint..."
curl -X POST http://localhost:8765/status \
  -d "CallSid=TEST_CALL_001" \
  -d "CallStatus=completed"
