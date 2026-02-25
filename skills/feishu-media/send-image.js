#!/usr/bin/env node

/**
 * Send image to Feishu using Lark SDK
 * Usage: node send-image.js <image-path> [target-id] [caption]
 * 
 * If target-id is omitted, uses FEISHU_TARGET_ID from environment
 */

import Lark from '@larksuiteoapi/node-sdk';
import fs from 'fs';
import path from 'path';

const APP_ID = 'cli_a9f68bf64bf9dbde';
const APP_SECRET = 'Blvo5l76nUkYvcyqw5YfPcdUD1GBYebi';

/**
 * Send image to Feishu
 * @param {string} imagePath - Local file path
 * @param {string} targetId - Target chat_id or open_id
 * @param {string} caption - Optional caption text
 * @returns {Promise<object>} Response with message_id
 */
export async function sendImageToFeishu(imagePath, targetId, caption = '') {
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

  if (uploadResponse.code !== 0 && uploadResponse.code !== undefined) {
    throw new Error(`Upload failed: ${uploadResponse.msg || uploadResponse.code}`);
  }

  const imageKey = uploadResponse.image_key || uploadResponse.data?.image_key;
  if (!imageKey) {
    throw new Error('Upload failed: no image_key returned');
  }
  console.log(`✅ Image uploaded, key: ${imageKey}`);

  // Step 2: Determine receive_id_type based on prefix
  let receiveIdType = 'chat_id';
  if (targetId.startsWith('ou_')) {
    receiveIdType = 'open_id';
  } else if (targetId.startsWith('oc_')) {
    receiveIdType = 'chat_id';
  }

  // Step 3: Send image message
  console.log(`📨 Sending image to ${targetId} (type: ${receiveIdType})...`);
  
  const sendResponse = await client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: {
      receive_id: targetId,
      content: JSON.stringify({ image_key: imageKey }),
      msg_type: 'image',
    },
  });

  if (sendResponse.code !== 0) {
    throw new Error(`Send failed: ${sendResponse.msg || sendResponse.code}`);
  }

  console.log(`✅ Image sent! Message ID: ${sendResponse.data.message_id}`);

  // Step 4: Send caption if provided
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

  return {
    success: true,
    imageKey,
    messageId: sendResponse.data.message_id,
    chatId: sendResponse.data.chat_id,
  };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const [,, imagePath, targetId, caption] = process.argv;

  if (!imagePath) {
    console.error('Usage: node send-image.js <image-path> [target-id] [caption]');
    console.error('If target-id is omitted, uses FEISHU_TARGET_ID environment variable');
    process.exit(1);
  }

  if (!fs.existsSync(imagePath)) {
    console.error(`❌ File not found: ${imagePath}`);
    process.exit(1);
  }

  const finalTargetId = targetId || process.env.FEISHU_TARGET_ID;
  if (!finalTargetId) {
    console.error('❌ No target-id provided and FEISHU_TARGET_ID not set');
    process.exit(1);
  }

  sendImageToFeishu(imagePath, finalTargetId, caption)
    .then((result) => {
      console.log('🎉 Success!');
      console.log(`   Image Key: ${result.imageKey}`);
      console.log(`   Message ID: ${result.messageId}`);
      console.log(`   Chat ID: ${result.chatId}`);
    })
    .catch((err) => {
      console.error('❌ Error:', err.message);
      process.exit(1);
    });
}
