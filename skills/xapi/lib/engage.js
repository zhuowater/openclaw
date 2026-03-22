const XAPIClient = require('./client');

/**
 * Like a tweet
 */
async function likeTweet(tweetId, userId) {
  const client = new XAPIClient({ skipRateLockCheck: true });

  // If userId not provided, we need to get it from access token
  if (!userId) {
    // For simplicity, user must provide their userId
    // Alternative: call GET /2/users/me to get authenticated user's ID
    throw new Error('userId required for liking. Get it from GET /2/users/me or pass explicitly.');
  }

  const body = {
    tweet_id: tweetId
  };

  try {
    const result = await client.request('POST', `/2/users/${userId}/likes`, { body });
    return result;
  } catch (error) {
    throw new Error(`Like tweet failed: ${JSON.stringify(error)}`);
  }
}

/**
 * Unlike a tweet
 */
async function unlikeTweet(tweetId, userId) {
  const client = new XAPIClient({ skipRateLockCheck: true });

  if (!userId) {
    throw new Error('userId required for unliking.');
  }

  try {
    const result = await client.request('DELETE', `/2/users/${userId}/likes/${tweetId}`);
    return result;
  } catch (error) {
    throw new Error(`Unlike tweet failed: ${JSON.stringify(error)}`);
  }
}

/**
 * Retweet a tweet
 */
async function retweet(tweetId, userId) {
  const client = new XAPIClient({ skipRateLockCheck: true });

  if (!userId) {
    throw new Error('userId required for retweeting.');
  }

  const body = {
    tweet_id: tweetId
  };

  try {
    const result = await client.request('POST', `/2/users/${userId}/retweets`, { body });
    return result;
  } catch (error) {
    throw new Error(`Retweet failed: ${JSON.stringify(error)}`);
  }
}

/**
 * Undo retweet
 */
async function undoRetweet(tweetId, userId) {
  const client = new XAPIClient({ skipRateLockCheck: true });

  if (!userId) {
    throw new Error('userId required for undoing retweet.');
  }

  try {
    const result = await client.request('DELETE', `/2/users/${userId}/retweets/${tweetId}`);
    return result;
  } catch (error) {
    throw new Error(`Undo retweet failed: ${JSON.stringify(error)}`);
  }
}

/**
 * Get authenticated user's info (to get userId)
 */
async function getMe() {
  const client = new XAPIClient({ skipRateLockCheck: true });

  const queryParams = {
    'user.fields': 'created_at,description,public_metrics,verified'
  };

  try {
    const result = await client.request('GET', '/2/users/me', { queryParams });
    return result;
  } catch (error) {
    throw new Error(`Get me failed: ${JSON.stringify(error)}`);
  }
}

module.exports = { likeTweet, unlikeTweet, retweet, undoRetweet, getMe };
