#!/usr/bin/env node

/**
 * 飞书媒体发送 CLI
 * 快速发送图片的命令行工具
 */

const { sendImage } = require('./send-media.js');

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
飞书媒体发送工具

用法:
  feishu-send <图片路径/URL/base64> [选项]

选项:
  --to <id>           指定接收者 ID（默认从环境变量读取）
  --type <type>       接收者类型: auto（默认）, chat_id, open_id, union_id
  --help, -h          显示帮助信息

环境变量:
  FEISHU_BOT_TOKEN    飞书机器人 token（必需）
  FEISHU_CHAT_ID      默认接收者 ID（可选）

示例:
  # 发送本地图片
  feishu-send /path/to/image.png

  # 发送 URL 图片
  feishu-send https://example.com/image.jpg

  # 指定接收者（自动检测类型）
  feishu-send image.png --to ou_xxxxx

  # 或明确指定类型
  feishu-send image.png --to oc_xxxxx --type chat_id

  # 从标准输入读取 base64
  echo "data:image/png;base64,..." | feishu-send -
  `);
  process.exit(0);
}

// 解析参数
let source = args[0];
let receiveId = null;
let receiveIdType = 'auto'; // 默认自动检测

for (let i = 1; i < args.length; i++) {
  if (args[i] === '--to' && args[i + 1]) {
    receiveId = args[++i];
  } else if (args[i] === '--type' && args[i + 1]) {
    receiveIdType = args[++i];
  }
}

// 如果是 stdin
if (source === '-') {
  let stdin = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => stdin += chunk);
  process.stdin.on('end', () => {
    source = stdin.trim();
    doSend();
  });
} else {
  doSend();
}

function doSend() {
  sendImage(source, receiveId, receiveIdType)
    .then(result => {
      console.log('✅ 发送成功!');
      console.log(`   Image Key: ${result.imageKey}`);
      console.log(`   Message ID: ${result.messageId}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ 发送失败:', error.message);
      process.exit(1);
    });
}
