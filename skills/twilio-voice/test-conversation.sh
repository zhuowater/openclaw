#!/bin/bash
# Complete conversation test

BASE_URL="http://localhost:8765"
CALL_SID="TEST_$(date +%s)"

echo "==================================="
echo "Starting conversation test"
echo "CallSid: $CALL_SID"
echo "==================================="

echo -e "\n1. Initial call (establishing session)..."
curl -X POST "$BASE_URL/voice" \
  -d "CallSid=$CALL_SID" \
  -d "From=+13239037711" \
  -d "To=+18305212085" \
  2>&1 | head -3

sleep 2

echo -e "\n\n2. User says: '你好'..."
curl -X POST "$BASE_URL/gather" \
  -d "CallSid=$CALL_SID" \
  -d "SpeechResult=你好" \
  -d "Confidence=0.95" \
  2>&1 | grep -A5 "Say"

sleep 2

echo -e "\n\n3. User says: '今天天气怎么样'..."
curl -X POST "$BASE_URL/gather" \
  -d "CallSid=$CALL_SID" \
  -d "SpeechResult=今天天气怎么样" \
  -d "Confidence=0.92" \
  2>&1 | grep -A5 "Say"

sleep 2

echo -e "\n\n4. End call..."
curl -X POST "$BASE_URL/status" \
  -d "CallSid=$CALL_SID" \
  -d "CallStatus=completed" \
  2>&1

echo -e "\n\n==================================="
echo "Test complete!"
echo "==================================="
