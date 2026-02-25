#!/usr/bin/env node

/**
 * Send image to Feishu directly using the Lark SDK
 * Usage: node send-feishu-image.js <image-path> <chat-id> [caption]
 * 
 * chat-id can be:
 *   - chat ID (oc_xxx)
 *   - open_id (ou_xxx) - will try both receive_id_type
 */

import Lark from '@larksuiteoapi/node-sdk';
import fs from 'fs';
import path from 'path';

const APP_ID = 'cli_a9f68bf64bf9dbde';
const APP_SECRET = 'Blvo5l76nUkYvcyqw5YfPcdUD1GBYebi';

async function sendImage(imagePath, targetId, caption = '') {
  // Create Lark client
  const client = new Lark.Client({
    appId: APP_ID,
    appSecret: APP_SECRET,
  });

  console.log('📤 Uploading image to Feishu...');
  
  // Step 1: Upload image to get image_key
  const imageStream = fs.createReadStream(imagePath);
  const uploadResponse = await client.im.image.create({
    data: {
      image_type: 'message',
      image: imageStream,
    },
  });

  console.log('Upload response:', JSON.stringify(uploadResponse, null, 2));

  if (uploadResponse.code !== 0 && uploadResponse.code !== undefined) {
    throw new Error(`Upload failed: ${uploadResponse.msg || uploadResponse.code}`);
  }

  const imageKey = uploadResponse.image_key || uploadResponse.data?.image_key;
  if (!imageKey) {
    throw new Error('Upload failed: no image_key returned');
  }
  console.log(`✅ Image uploaded, key: ${imageKey}`);

  // Step 2: Determine receive_id_type based on prefix
  let receiveIdType = 'chat_id';  // Default to chat_id
  if (targetId.startsWith('ou_')) {
    receiveIdType = 'open_id';
  } else if (targetId.startsWith('oc_')) {
    receiveIdType = 'chat_id';
  }

  // Step 2: Send image message
  console.log(`📨 Sending image to ${targetId} (type: ${receiveIdType})...`);
  
  const sendResponse = await client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: {
      receive_id: targetId,
      content: JSON.stringify({ image_key: imageKey }),
      msg_type: 'image',
    },
  });

  console.log('Send response:', JSON.stringify(sendResponse, null, 2));

  if (sendResponse.code !== 0) {
    throw new Error(`Send failed: ${sendResponse.msg || sendResponse.code}`);
  }

  console.log(`✅ Image sent! Message ID: ${sendResponse.data.message_id}`);

  // Step 3: Send caption if provided
  if (caption) {
    console.log(`📝 Sending caption...`);
    const captionResponse = await client.im.message.create({
      params: { receive_id_type: receiveIdType },
      data: {
        receive_id: targetId,
        content: JSON.stringify({ text: caption }),
        msg_type: 'text',
      },
    });

    if (captionResponse.code === 0) {
      console.log(`✅ Caption sent!`);
    }
  }

  return sendResponse.data;
}

// Main
const [,, imagePath, targetId, caption] = process.argv;

if (!imagePath || !targetId) {
  console.error('Usage: node send-feishu-image.js <image-path> <chat-id|open-id> [caption]');
  process.exit(1);
}

if (!fs.existsSync(imagePath)) {
  console.error(`❌ File not found: ${imagePath}`);
  process.exit(1);
}

sendImage(imagePath, targetId, caption)
  .then(() => {
    console.log('🎉 All done!');
  })
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
