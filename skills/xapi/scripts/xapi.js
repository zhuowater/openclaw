#!/usr/bin/env node

const xapi = require('../index');

const commands = {
  search: async (args) => {
    const query = args[0];
    const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 10;
    
    if (!query) {
      console.error('Usage: xapi.js search "<query>" [--limit N]');
      process.exit(1);
    }

    const result = await xapi.searchTweets(query, { limit });
    console.log(JSON.stringify(result, null, 2));
  },

  tweet: async (args) => {
    const text = args[0];
    const mediaPath = args.includes('--media') ? args[args.indexOf('--media') + 1] : null;
    const replyToId = args.includes('--reply-to') ? args[args.indexOf('--reply-to') + 1] : null;

    if (!text) {
      console.error('Usage: xapi.js tweet "<text>" [--media PATH] [--reply-to TWEET_ID]');
      process.exit(1);
    }

    const result = await xapi.postTweet(text, { mediaPath, replyToId });
    console.log(JSON.stringify(result, null, 2));
  },

  delete: async (args) => {
    const tweetId = args[0];

    if (!tweetId) {
      console.error('Usage: xapi.js delete <tweet_id>');
      process.exit(1);
    }

    const result = await xapi.deleteTweet(tweetId);
    console.log(JSON.stringify(result, null, 2));
  },

  read: async (args) => {
    const tweetId = args[0];

    if (!tweetId) {
      console.error('Usage: xapi.js read <tweet_id>');
      process.exit(1);
    }

    const result = await xapi.getTweet(tweetId);
    console.log(JSON.stringify(result, null, 2));
  },

  timeline: async (args) => {
    const username = args[0];
    const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 10;

    if (!username) {
      console.error('Usage: xapi.js timeline <@username|user_id> [--limit N]');
      process.exit(1);
    }

    const result = await xapi.getUserTimeline(username, { limit });
    console.log(JSON.stringify(result, null, 2));
  },

  like: async (args) => {
    const tweetId = args[0];
    const userId = args.includes('--user-id') ? args[args.indexOf('--user-id') + 1] : null;

    if (!tweetId) {
      console.error('Usage: xapi.js like <tweet_id> [--user-id USER_ID]');
      console.error('If --user-id not provided, will use authenticated user (call "me" first)');
      process.exit(1);
    }

    // If no userId, try to get it
    let finalUserId = userId;
    if (!finalUserId) {
      const meResult = await xapi.getMe();
      finalUserId = meResult.data.id;
    }

    const result = await xapi.likeTweet(tweetId, finalUserId);
    console.log(JSON.stringify(result, null, 2));
  },

  unlike: async (args) => {
    const tweetId = args[0];
    const userId = args.includes('--user-id') ? args[args.indexOf('--user-id') + 1] : null;

    if (!tweetId) {
      console.error('Usage: xapi.js unlike <tweet_id> [--user-id USER_ID]');
      process.exit(1);
    }

    let finalUserId = userId;
    if (!finalUserId) {
      const meResult = await xapi.getMe();
      finalUserId = meResult.data.id;
    }

    const result = await xapi.unlikeTweet(tweetId, finalUserId);
    console.log(JSON.stringify(result, null, 2));
  },

  retweet: async (args) => {
    const tweetId = args[0];
    const userId = args.includes('--user-id') ? args[args.indexOf('--user-id') + 1] : null;

    if (!tweetId) {
      console.error('Usage: xapi.js retweet <tweet_id> [--user-id USER_ID]');
      process.exit(1);
    }

    let finalUserId = userId;
    if (!finalUserId) {
      const meResult = await xapi.getMe();
      finalUserId = meResult.data.id;
    }

    const result = await xapi.retweet(tweetId, finalUserId);
    console.log(JSON.stringify(result, null, 2));
  },

  'undo-retweet': async (args) => {
    const tweetId = args[0];
    const userId = args.includes('--user-id') ? args[args.indexOf('--user-id') + 1] : null;

    if (!tweetId) {
      console.error('Usage: xapi.js undo-retweet <tweet_id> [--user-id USER_ID]');
      process.exit(1);
    }

    let finalUserId = userId;
    if (!finalUserId) {
      const meResult = await xapi.getMe();
      finalUserId = meResult.data.id;
    }

    const result = await xapi.undoRetweet(tweetId, finalUserId);
    console.log(JSON.stringify(result, null, 2));
  },

  reply: async (args) => {
    const tweetId = args[0];
    const text = args[1];

    if (!tweetId || !text) {
      console.error('Usage: xapi.js reply <tweet_id> "<text>"');
      process.exit(1);
    }

    const result = await xapi.postTweet(text, { replyToId: tweetId });
    console.log(JSON.stringify(result, null, 2));
  },

  me: async (args) => {
    const result = await xapi.getMe();
    console.log(JSON.stringify(result, null, 2));
  }
};

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const commandArgs = args.slice(1);

  if (!command || !commands[command]) {
    console.error('X (Twitter) API CLI');
    console.error('');
    console.error('Usage: xapi.js <command> [args]');
    console.error('');
    console.error('Commands:');
    console.error('  search "<query>" [--limit N]           - Search recent tweets');
    console.error('  tweet "<text>" [--media PATH]          - Post a tweet');
    console.error('  delete <tweet_id>                      - Delete a tweet');
    console.error('  read <tweet_id>                        - Get tweet details');
    console.error('  timeline <@username> [--limit N]       - Get user timeline');
    console.error('  like <tweet_id> [--user-id ID]         - Like a tweet');
    console.error('  unlike <tweet_id> [--user-id ID]       - Unlike a tweet');
    console.error('  retweet <tweet_id> [--user-id ID]      - Retweet');
    console.error('  undo-retweet <tweet_id> [--user-id ID] - Undo retweet');
    console.error('  reply <tweet_id> "<text>"              - Reply to tweet');
    console.error('  me                                     - Get authenticated user info');
    console.error('');
    console.error('Environment variables required:');
    console.error('  X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET');
    console.error('  X_BEARER_TOKEN (optional, for search)');
    process.exit(1);
  }

  try {
    await commands[command](commandArgs);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
