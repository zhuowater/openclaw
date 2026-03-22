const XAPIClient = require('./client');
const { isRateLocked } = require('./client');

/**
 * Attach media includes to tweet objects for easier access.
 */
function attachMediaToTweets(apiResult) {
  if (!apiResult || !apiResult.includes || !apiResult.includes.media) return apiResult;
  const mediaMap = {};
  for (const m of apiResult.includes.media) mediaMap[m.media_key] = m;
  if (apiResult.data) {
    for (const tweet of apiResult.data) {
      const keys = tweet.attachments?.media_keys || [];
      if (keys.length > 0) tweet.media = keys.map(k => mediaMap[k]).filter(Boolean);
    }
  }
  return apiResult;
}

/**
 * Search tweets by keyword/hashtag
 */
async function searchTweets(query, options = {}) {
  // Fast-fail if monthly cap is locked
  const lock = isRateLocked();
  if (lock) {
    const expires = new Date(lock.expiresAt).toISOString().slice(0, 10);
    throw new Error(`Search: X API monthly cap exceeded (locked until ${expires}). Skipping to save resources.`);
  }
  const client = new XAPIClient();
  const { limit = 10, startTime, endTime } = options;

  const queryParams = {
    query,
    max_results: Math.max(10, Math.min(limit, 100)),
    'tweet.fields': 'created_at,author_id,public_metrics,entities,attachments',
    'user.fields': 'name,username,verified',
    'media.fields': 'url,preview_image_url,type,width,height,alt_text',
    expansions: 'author_id,attachments.media_keys'
  };

  if (startTime) queryParams.start_time = startTime;
  if (endTime) queryParams.end_time = endTime;

  try {
    const result = await client.request('GET', '/2/tweets/search/recent', {
      queryParams,
      useBearerToken: true
    });

    return attachMediaToTweets(result);
  } catch (error) {
    throw new Error(`Search failed: ${JSON.stringify(error)}`);
  }
}

module.exports = { searchTweets };
