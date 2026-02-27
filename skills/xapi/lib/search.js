const XAPIClient = require('./client');

/**
 * Search tweets by keyword/hashtag
 */
async function searchTweets(query, options = {}) {
  const client = new XAPIClient();
  const { limit = 10, startTime, endTime } = options;

  const queryParams = {
    query,
    max_results: Math.max(10, Math.min(limit, 100)),
    'tweet.fields': 'created_at,author_id,public_metrics,entities',
    'user.fields': 'name,username,verified',
    expansions: 'author_id'
  };

  if (startTime) queryParams.start_time = startTime;
  if (endTime) queryParams.end_time = endTime;

  try {
    const result = await client.request('GET', '/2/tweets/search/recent', {
      queryParams,
      useBearerToken: true // Search requires Bearer Token
    });

    return result;
  } catch (error) {
    throw new Error(`Search failed: ${JSON.stringify(error)}`);
  }
}

module.exports = { searchTweets };
