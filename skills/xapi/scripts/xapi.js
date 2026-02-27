#!/usr/bin/env node

const xapi = require('../index');

const commands = {
  search: async (args) => {
    const query = args[0];
    const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 10;
    if (!query) { console.error('Usage: xapi.js search "<query>" [--limit N]'); process.exit(1); }
    const result = await xapi.searchTweets(query, { limit });
    console.log(JSON.stringify(result, null, 2));
  },

  tweet: async (args) => {
    const text = args[0];
    const mediaPath = args.includes('--media') ? args[args.indexOf('--media') + 1] : null;
    const replyToId = args.includes('--reply-to') ? args[args.indexOf('--reply-to') + 1] : null;
    const quoteTweetId = args.includes('--quote') ? args[args.indexOf('--quote') + 1] : null;
    if (!text) { console.error('Usage: xapi.js tweet "<text>" [--media PATH] [--reply-to ID] [--quote ID]'); process.exit(1); }
    const result = await xapi.postTweet(text, { mediaPath, replyToId, quoteTweetId });
    console.log(JSON.stringify(result, null, 2));
  },

  thread: async (args) => {
    // Read texts from stdin (separated by ---) or pass as JSON array
    const input = args[0];
    if (!input) {
      console.error('Usage: xapi.js thread \'["tweet1","tweet2",...]\' [--media PATH]');
      process.exit(1);
    }
    const texts = JSON.parse(input);
    const mediaPath = args.includes('--media') ? args[args.indexOf('--media') + 1] : null;
    const results = await xapi.postThread(texts, { mediaPath });
    console.log(JSON.stringify(results, null, 2));
  },

  article: async (args) => {
    const title = args[0];
    const content = args[1];
    if (!title || !content) {
      console.error('Usage: xapi.js article "<title>" "<content>" [--tags tag1,tag2]');
      process.exit(1);
    }
    const hashtags = args.includes('--tags') ? args[args.indexOf('--tags') + 1].split(',') : [];
    const mediaPath = args.includes('--media') ? args[args.indexOf('--media') + 1] : null;
    const result = await xapi.postArticle(title, content, { hashtags, mediaPath });
    console.log(JSON.stringify(result, null, 2));
  },

  delete: async (args) => {
    const tweetId = args[0];
    if (!tweetId) { console.error('Usage: xapi.js delete <tweet_id>'); process.exit(1); }
    const result = await xapi.deleteTweet(tweetId);
    console.log(JSON.stringify(result, null, 2));
  },

  read: async (args) => {
    const tweetId = args[0];
    if (!tweetId) { console.error('Usage: xapi.js read <tweet_id>'); process.exit(1); }
    const result = await xapi.getTweet(tweetId);
    console.log(JSON.stringify(result, null, 2));
  },

  timeline: async (args) => {
    const username = args[0];
    const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 10;
    if (!username) { console.error('Usage: xapi.js timeline <@username|user_id> [--limit N]'); process.exit(1); }
    const result = await xapi.getUserTimeline(username, { limit });
    console.log(JSON.stringify(result, null, 2));
  },

  like: async (args) => {
    const tweetId = args[0];
    if (!tweetId) { console.error('Usage: xapi.js like <tweet_id>'); process.exit(1); }
    let userId = args.includes('--user-id') ? args[args.indexOf('--user-id') + 1] : null;
    if (!userId) { const me = await xapi.getMe(); userId = me.data.id; }
    const result = await xapi.likeTweet(tweetId, userId);
    console.log(JSON.stringify(result, null, 2));
  },

  unlike: async (args) => {
    const tweetId = args[0];
    if (!tweetId) { console.error('Usage: xapi.js unlike <tweet_id>'); process.exit(1); }
    let userId = args.includes('--user-id') ? args[args.indexOf('--user-id') + 1] : null;
    if (!userId) { const me = await xapi.getMe(); userId = me.data.id; }
    const result = await xapi.unlikeTweet(tweetId, userId);
    console.log(JSON.stringify(result, null, 2));
  },

  retweet: async (args) => {
    const tweetId = args[0];
    if (!tweetId) { console.error('Usage: xapi.js retweet <tweet_id>'); process.exit(1); }
    let userId = args.includes('--user-id') ? args[args.indexOf('--user-id') + 1] : null;
    if (!userId) { const me = await xapi.getMe(); userId = me.data.id; }
    const result = await xapi.retweet(tweetId, userId);
    console.log(JSON.stringify(result, null, 2));
  },

  'undo-retweet': async (args) => {
    const tweetId = args[0];
    if (!tweetId) { console.error('Usage: xapi.js undo-retweet <tweet_id>'); process.exit(1); }
    let userId = args.includes('--user-id') ? args[args.indexOf('--user-id') + 1] : null;
    if (!userId) { const me = await xapi.getMe(); userId = me.data.id; }
    const result = await xapi.undoRetweet(tweetId, userId);
    console.log(JSON.stringify(result, null, 2));
  },

  reply: async (args) => {
    const tweetId = args[0];
    const text = args[1];
    if (!tweetId || !text) { console.error('Usage: xapi.js reply <tweet_id> "<text>"'); process.exit(1); }
    const result = await xapi.postTweet(text, { replyToId: tweetId });
    console.log(JSON.stringify(result, null, 2));
  },

  follow: async (args) => {
    const target = args[0];
    if (!target) { console.error('Usage: xapi.js follow <user_id|@username>'); process.exit(1); }
    const me = await xapi.getMe();
    let targetId = target;
    if (target.startsWith('@')) {
      const user = await xapi.getUserByUsername(target.replace('@', ''));
      targetId = user.data.id;
    }
    const result = await xapi.followUser(targetId, me.data.id);
    console.log(JSON.stringify(result, null, 2));
  },

  unfollow: async (args) => {
    const target = args[0];
    if (!target) { console.error('Usage: xapi.js unfollow <user_id|@username>'); process.exit(1); }
    const me = await xapi.getMe();
    let targetId = target;
    if (target.startsWith('@')) {
      const user = await xapi.getUserByUsername(target.replace('@', ''));
      targetId = user.data.id;
    }
    const result = await xapi.unfollowUser(targetId, me.data.id);
    console.log(JSON.stringify(result, null, 2));
  },

  followers: async (args) => {
    const me = await xapi.getMe();
    const result = await xapi.getFollowers(me.data.id);
    console.log(JSON.stringify(result, null, 2));
  },

  following: async (args) => {
    const me = await xapi.getMe();
    const result = await xapi.getFollowing(me.data.id);
    console.log(JSON.stringify(result, null, 2));
  },

  bookmark: async (args) => {
    const tweetId = args[0];
    if (!tweetId) { console.error('Usage: xapi.js bookmark <tweet_id>'); process.exit(1); }
    const me = await xapi.getMe();
    const result = await xapi.bookmarkTweet(tweetId, me.data.id);
    console.log(JSON.stringify(result, null, 2));
  },

  bookmarks: async (args) => {
    const me = await xapi.getMe();
    const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 20;
    const result = await xapi.getBookmarks(me.data.id, { limit });
    console.log(JSON.stringify(result, null, 2));
  },

  me: async () => {
    const result = await xapi.getMe();
    console.log(JSON.stringify(result, null, 2));
  }
};

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const commandArgs = args.slice(1);

  if (!command || !commands[command]) {
    console.error('X (Twitter) API CLI — Premium Enhanced');
    console.error('');
    console.error('Usage: xapi.js <command> [args]');
    console.error('');
    console.error('Tweet Operations (Premium: up to 25K chars):');
    console.error('  tweet "<text>" [--media PATH] [--quote ID] Post a tweet');
    console.error('  thread \'["t1","t2"]\' [--media PATH]       Post a thread');
    console.error('  article "<title>" "<content>" [--tags ..]  Post long article');
    console.error('  delete <tweet_id>                          Delete a tweet');
    console.error('  read <tweet_id>                            Get tweet details');
    console.error('');
    console.error('Search & Timeline:');
    console.error('  search "<query>" [--limit N]               Search tweets');
    console.error('  timeline <@username> [--limit N]           User timeline');
    console.error('');
    console.error('Engagement:');
    console.error('  like/unlike <tweet_id>                     Like/unlike');
    console.error('  retweet/undo-retweet <tweet_id>            Retweet');
    console.error('  reply <tweet_id> "<text>"                  Reply');
    console.error('  bookmark <tweet_id>                        Bookmark (Premium)');
    console.error('  bookmarks [--limit N]                      List bookmarks');
    console.error('');
    console.error('Social:');
    console.error('  follow/unfollow <@username|user_id>        Follow/unfollow');
    console.error('  followers                                  List my followers');
    console.error('  following                                  List who I follow');
    console.error('  me                                         My profile');
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
