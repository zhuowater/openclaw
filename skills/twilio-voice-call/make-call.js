#!/usr/bin/env node
/**
 * Make outbound phone call via Twilio
 */

require('dotenv').config();
const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;
const publicUrl = process.env.PUBLIC_URL;

if (!accountSid || !authToken || !fromNumber) {
  console.error('❌ Missing Twilio credentials in .env');
  process.exit(1);
}

const toNumber = process.argv[2];
if (!toNumber) {
  console.error('Usage: node make-call.js <phone_number>');
  console.error('Example: node make-call.js +8613800138000');
  process.exit(1);
}

const client = twilio(accountSid, authToken);

console.log(`📞 Calling ${toNumber} from ${fromNumber}...`);

client.calls
  .create({
    from: fromNumber,
    to: toNumber,
    url: `${publicUrl}/twilio/voice/incoming`,
    statusCallback: `${publicUrl}/twilio/voice/status`,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
  })
  .then((call) => {
    console.log(`✅ Call initiated: ${call.sid}`);
    console.log(`   Status: ${call.status}`);
  })
  .catch((error) => {
    console.error('❌ Call failed:', error.message);
  });
