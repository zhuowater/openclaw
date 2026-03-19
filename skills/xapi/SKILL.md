---
name: xapi
description: X (Twitter) API v2 integration. Search, post, read, engage with tweets via OAuth 1.0a + SOCKS5 proxy. Use when user mentions tweeting, X/Twitter search, posting to X, checking timeline, or social media engagement.
---

# X (Twitter) API Skill

Complete X (Twitter) API v2 integration for OpenClaw. Search, post, read, and engage with tweets via OAuth 1.0a authentication with SOCKS5 proxy support.

## Features

- **Search** - Find tweets by keyword, hashtag, or advanced queries
- **Post** - Tweet text, images, and replies
- **Read** - Get specific tweets and user timelines
- **Engage** - Like, retweet, and reply to tweets

## Prerequisites

### 1. Get X API Credentials

1. Go to [developer.x.com](https://developer.x.com)
2. Create a new App (or use existing one)
3. Navigate to "Keys and tokens" tab
4. Generate:
   - **API Key** (Consumer Key)
   - **API Secret** (Consumer Secret)
   - **Access Token**
   - **Access Token Secret**
   - **Bearer Token** (optional, for search with App-Only auth)

### 2. Set up Environment Variables

Add to your shell profile (`~/.bashrc`, `~/.zshrc`, or OpenClaw gateway env):

```bash
export X_API_KEY="your_api_key"
export X_API_SECRET="your_api_secret"
export X_ACCESS_TOKEN="your_access_token"
export X_ACCESS_TOKEN_SECRET="your_access_token_secret"
export X_BEARER_TOKEN="your_bearer_token"  # Optional, for search
```

Reload your shell:
```bash
source ~/.bashrc
```

### 3. SOCKS5 Proxy

This skill uses SOCKS5 proxy (`socks5h://127.0.0.1:7880`) to bypass the Great Firewall, as X is blocked in China. Ensure your SOCKS5 proxy is running before making requests.

## Installation

```bash
cd /root/openclaw/skills/xapi
npm install
```

## Usage

### CLI Interface

The skill provides a CLI for quick testing and manual operations:

```bash
node scripts/xapi.js <command> [args]
```

### Commands

#### Search Tweets
```bash
# Search recent tweets
node scripts/xapi.js search "AI safety" --limit 10
node scripts/xapi.js search "#bitcoin" --limit 20
```

#### Post Tweet
```bash
# Simple tweet
node scripts/xapi.js tweet "Hello from OpenClaw! 🤖"

# Tweet with image
node scripts/xapi.js tweet "Check this out!" --media /path/to/image.jpg

# Reply to a tweet
node scripts/xapi.js reply 1234567890 "Great point!"
```

#### Read Tweets
```bash
# Get specific tweet
node scripts/xapi.js read 1234567890

# Get user timeline
node scripts/xapi.js timeline @elonmusk --limit 5
node scripts/xapi.js timeline 44196397 --limit 10  # By user ID
```

#### Engage
```bash
# Get your user info (userId needed for engagement)
node scripts/xapi.js me

# Like a tweet
node scripts/xapi.js like 1234567890

# Unlike
node scripts/xapi.js unlike 1234567890

# Retweet
node scripts/xapi.js retweet 1234567890

# Undo retweet
node scripts/xapi.js undo-retweet 1234567890
```

#### Delete Tweet
```bash
node scripts/xapi.js delete 1234567890
```

### Programmatic Usage

```javascript
const xapi = require('/root/openclaw/skills/xapi');

// Search tweets
const searchResult = await xapi.searchTweets('AI safety', { limit: 10 });

// Post a tweet
const tweetResult = await xapi.postTweet('Hello world!');

// Post with image
const tweetWithMedia = await xapi.postTweet('Check this!', {
  mediaPath: '/path/to/image.jpg'
});

// Get a tweet
const tweet = await xapi.getTweet('1234567890');

// Get user timeline
const timeline = await xapi.getUserTimeline('@username', { limit: 10 });

// Get authenticated user info
const me = await xapi.getMe();
const myUserId = me.data.id;

// Like a tweet
await xapi.likeTweet('1234567890', myUserId);

// Retweet
await xapi.retweet('1234567890', myUserId);
```

## API Reference

### Search

- `searchTweets(query, options)` - Search recent tweets
  - `query` - Search query string (supports hashtags, keywords, operators)
  - `options.limit` - Max results (default: 10, max: 100)
  - `options.startTime` - ISO 8601 start time
  - `options.endTime` - ISO 8601 end time

### Tweets

- `postTweet(text, options)` - Post a new tweet
  - `text` - Tweet content (max 280 chars)
  - `options.mediaPath` - Path to image/video file
  - `options.replyToId` - Tweet ID to reply to
- `deleteTweet(tweetId)` - Delete a tweet
- `getTweet(tweetId)` - Get tweet details

### Timeline

- `getUserByUsername(username)` - Get user info by username
- `getUserTimeline(username, options)` - Get user's tweets
  - `username` - Username (with or without @) or user ID
  - `options.limit` - Max results (default: 10)

### Engagement

- `likeTweet(tweetId, userId)` - Like a tweet
- `unlikeTweet(tweetId, userId)` - Unlike a tweet
- `retweet(tweetId, userId)` - Retweet
- `undoRetweet(tweetId, userId)` - Remove retweet
- `getMe()` - Get authenticated user info (returns userId)

## Rate Limits

X API v2 has rate limits per endpoint:

- **Search**: 180 requests per 15-min window (App-Only auth)
- **Tweet creation**: 200 tweets per 24 hours (User Context)
- **Likes**: 1000 per 24 hours
- **Retweets**: 50 per 15-min window

When you hit a rate limit, the API returns a 429 error. Wait for the reset window.

## Authentication

This skill uses **OAuth 1.0a** for User Context authentication, allowing actions on behalf of a specific user (post, like, retweet).

**Search** optionally uses **Bearer Token** (App-Only auth) for higher rate limits.

### OAuth 1.0a Flow

The client automatically:
1. Generates OAuth signature using HMAC-SHA1
2. Creates Authorization header with consumer key, token, timestamp, nonce, and signature
3. Signs all requests with your API credentials

No manual signing needed — just set environment variables.

## Proxy Configuration

All requests route through SOCKS5 proxy at `127.0.0.1:7880`. This is hardcoded in `lib/client.js`:

```javascript
this.proxyAgent = new SocksProxyAgent('socks5h://127.0.0.1:7880');
```

To change the proxy, edit `lib/client.js` or make it configurable via environment variable.

## Media Upload

Images and videos must be uploaded to `https://upload.twitter.com/1.1/media/upload.json` before attaching to tweets. The skill handles this automatically:

```javascript
await xapi.postTweet('Check this!', { mediaPath: '/path/to/image.png' });
```

Supported formats: JPEG, PNG, GIF, MP4 (videos)

Max size:
- Images: 5 MB
- GIFs: 15 MB
- Videos: 512 MB

## Error Handling

All functions throw errors with detailed messages:

```javascript
try {
  await xapi.postTweet('Hello!');
} catch (error) {
  console.error('Error:', error.message);
  // Error includes HTTP status and API error details
}
```

Common errors:
- `401` - Invalid credentials
- `403` - Forbidden (permissions issue)
- `404` - Tweet or user not found
- `429` - Rate limit exceeded

## Troubleshooting

### "Missing required X API credentials"
Set all four environment variables: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`.

### "ECONNREFUSED" or "getaddrinfo ENOTFOUND"
SOCKS5 proxy is not running or unreachable. Check that `127.0.0.1:7880` is active.

### "401 Unauthorized"
- Check that credentials are correct
- Verify access token permissions (Read + Write for posting)
- Regenerate tokens if expired

### "403 Forbidden"
- App does not have required permissions
- Check app settings on developer.x.com
- Enable "Read and Write" permissions

### Search returns empty results
- Ensure `X_BEARER_TOKEN` is set
- Try simpler queries first
- Check rate limits

## Architecture

```
/root/openclaw/skills/xapi/
├── SKILL.md          # This file
├── package.json      # Dependencies
├── index.js          # Main entry (exports all functions)
├── lib/
│   ├── client.js     # HTTP client + OAuth 1.0a + SOCKS5
│   ├── search.js     # Search tweets
│   ├── tweet.js      # Post, delete, read tweets
│   ├── timeline.js   # User timeline, lookup
│   └── engage.js     # Like, retweet, etc.
└── scripts/
    └── xapi.js       # CLI interface
```

## Dependencies

- `socks-proxy-agent` - SOCKS5 proxy support
- Node.js built-ins: `crypto`, `https`, `fs`

No heavy dependencies like `twitter-api-v2`. Lightweight and transparent.

## Examples

### Monitor mentions
```javascript
const result = await xapi.searchTweets('@yourusername', { limit: 10 });
result.data.forEach(tweet => {
  console.log(`${tweet.author_id}: ${tweet.text}`);
});
```

### Auto-reply bot
```javascript
const mentions = await xapi.searchTweets('@yourusername', { limit: 5 });
for (const tweet of mentions.data) {
  await xapi.postTweet('Thanks for the mention!', { replyToId: tweet.id });
}
```

### Thread reader
```javascript
const tweet = await xapi.getTweet('1234567890');
console.log(tweet.data.text);

if (tweet.data.referenced_tweets) {
  for (const ref of tweet.data.referenced_tweets) {
    if (ref.type === 'replied_to') {
      const parent = await xapi.getTweet(ref.id);
      console.log('Parent:', parent.data.text);
    }
  }
}
```

## License

MIT

## Credits

Built for OpenClaw by AI. OAuth 1.0a implementation based on [RFC 5849](https://tools.ietf.org/html/rfc5849).
