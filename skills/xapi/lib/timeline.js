const XAPIClient = require('./client');

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
    'tweet.fields': 'created_at,public_metrics,entities,referenced_tweets',
    'user.fields': 'name,username,verified',
    expansions: 'author_id'
  };

  try {
    const result = await client.request('GET', `/2/users/${userId}/tweets`, { queryParams });
    return result;
  } catch (error) {
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
    'tweet.fields': 'created_at,public_metrics,entities,author_id',
    'user.fields': 'name,username,verified',
    expansions: 'author_id'
  };

  try {
    const result = await client.request('GET', `/2/users/${userId}/timelines/reverse_chronological`, { queryParams });
    return result;
  } catch (error) {
    throw new Error(`Get home timeline failed: ${JSON.stringify(error)}`);
  }
}

module.exports = { getUserByUsername, getUserTimeline, getHomeTimeline };
