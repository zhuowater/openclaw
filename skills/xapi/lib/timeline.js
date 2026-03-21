const XAPIClient = require('./client');

/**
 * Attach media includes to tweet objects for easier access.
 * X API v2 returns media in a separate `includes.media` array,
 * linked by `attachments.media_keys`. This merges them into each tweet.
 */
function attachMediaToTweets(apiResult) {
  if (!apiResult || !apiResult.includes || !apiResult.includes.media) return apiResult;
  
  const mediaMap = {};
  for (const m of apiResult.includes.media) {
    mediaMap[m.media_key] = m;
  }
  
  if (apiResult.data) {
    for (const tweet of apiResult.data) {
      const keys = tweet.attachments?.media_keys || [];
      if (keys.length > 0) {
        tweet.media = keys.map(k => mediaMap[k]).filter(Boolean);
      }
    }
  }
  
  return apiResult;
}

/**
 * Get user ID by username
 */
async function getUserByUsername(username) {
  const client = new XAPIClient();
  
  // Remove @ if present
  const cleanUsername = username.replace(/^@/, '');

  const queryParams = {
    'user.fields': 'created_at,description,public_metrics,verified'
  };

  try {
    const result = await client.request('GET', `/2/users/by/username/${cleanUsername}`, { queryParams });
    return result;
  } catch (error) {
    if (error && error.statusCode === 429) {
      throw new Error(`Get user rate limited (429). X API cap exceeded. Try again later.`);
    }
    throw new Error(`Get user failed: ${JSON.stringify(error)}`);
  }
}

/**
 * Get user's timeline (tweets)
 */
async function getUserTimeline(username, options = {}) {
  const client = new XAPIClient();
  const { limit = 10 } = options;

  // First, get user ID
  let userId;
  if (username.match(/^\d+$/)) {
    userId = username;
  } else {
    const userResult = await getUserByUsername(username);
    userId = userResult.data.id;
  }

  const queryParams = {
    max_results: Math.min(limit, 100),
    'tweet.fields': 'created_at,public_metrics,entities,referenced_tweets,attachments',
    'user.fields': 'name,username,verified',
    'media.fields': 'url,preview_image_url,type,width,height,alt_text',
    expansions: 'author_id,attachments.media_keys'
  };

  try {
    const result = await client.request('GET', `/2/users/${userId}/tweets`, { queryParams });
    return attachMediaToTweets(result);
  } catch (error) {
    if (error && error.statusCode === 429) {
      throw new Error(`Get user timeline rate limited (429). X API cap exceeded. Try again later.`);
    }
    throw new Error(`Get timeline failed: ${JSON.stringify(error)}`);
  }
}

/**
 * Get home timeline (For You / Following feed).
 * Requires user context auth (OAuth 1.0a).
 * This is what X recommends to the authenticated user.
 */
async function getHomeTimeline(userId, options = {}) {
  const client = new XAPIClient();
  const { limit = 20 } = options;

  const queryParams = {
    max_results: Math.min(limit, 100),
    'tweet.fields': 'created_at,public_metrics,entities,author_id,attachments',
    'user.fields': 'name,username,verified',
    'media.fields': 'url,preview_image_url,type,width,height,alt_text',
    expansions: 'author_id,attachments.media_keys'
  };

  try {
    const result = await client.request('GET', `/2/users/${userId}/timelines/reverse_chronological`, { queryParams });
    return attachMediaToTweets(result);
  } catch (error) {
    if (error && error.statusCode === 429) {
      const title = error.error?.error?.title || 'UsageCapExceeded';
      throw new Error(`Get home timeline rate limited (429 ${title}). X API monthly/daily cap may be exceeded. Try again later.`);
    }
    throw new Error(`Get home timeline failed: ${JSON.stringify(error)}`);
  }
}

module.exports = { getUserByUsername, getUserTimeline, getHomeTimeline };
