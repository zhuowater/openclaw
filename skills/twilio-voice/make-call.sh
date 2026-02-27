#!/bin/bash
# Make a test call using Twilio

set -e

TWILIO_SID="AC1cd31002d32cd4e317c993f3bb763f2b"
TWILIO_TOKEN="d0fa773cb08ce71c99cf7222566b6125"
FROM_PHONE="+18305212085"
TO_PHONE="${1:-+13239037711}"
WEBHOOK_URL="${2:-http://175.41.200.135:8765/voice}"

echo "==================================="
echo "Making Twilio Call"
echo "==================================="
echo "From: $FROM_PHONE"
echo "To:   $TO_PHONE"
echo "URL:  $WEBHOOK_URL"
echo "==================================="

curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_SID/Calls.json" \
  --data-urlencode "Url=$WEBHOOK_URL" \
  --data-urlencode "To=$TO_PHONE" \
  --data-urlencode "From=$FROM_PHONE" \
  --data-urlencode "StatusCallback=http://175.41.200.135:8765/status" \
  -u "$TWILIO_SID:$TWILIO_TOKEN" \
  | python3 -m json.tool

echo ""
echo "✓ Call initiated!"
