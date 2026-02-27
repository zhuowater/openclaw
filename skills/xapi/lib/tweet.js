const XAPIClient = require('./client');

/**
 * Post a tweet
 */
async function postTweet(text, options = {}) {
  const client = new XAPIClient();
  const { mediaPath, replyToId } = options;

  const body = { text };

  // Upload media if provided
  if (mediaPath) {
    try {
      const mediaResult = await client.uploadMedia(mediaPath);
      body.media = {
        media_ids: [mediaResult.media_id_string]
      };
    } catch (error) {
      throw new Error(`Media upload failed: ${JSON.stringify(error)}`);
    }
  }

  // Reply to another tweet
  if (replyToId) {
    body.reply = {
      in_reply_to_tweet_id: replyToId
    };
  }

  try {
    const result = await client.request('POST', '/2/tweets', { body });
    return result;
  } catch (error) {
    throw new Error(`Post tweet failed: ${JSON.stringify(error)}`);
  }
}

/**
 * Delete a tweet
 */
async function deleteTweet(tweetId) {
  const client = new XAPIClient();

  try {
    const result = await client.request('DELETE', `/2/tweets/${tweetId}`);
    return result;
  } catch (error) {
    throw new Error(`Delete tweet failed: ${JSON.stringify(error)}`);
  }
}

/**
 * Get a single tweet
 */
async function getTweet(tweetId) {
  const client = new XAPIClient();

  const queryParams = {
    'tweet.fields': 'created_at,author_id,public_metrics,entities,referenced_tweets',
    'user.fields': 'name,username,verified',
    expansions: 'author_id,referenced_tweets.id'
  };

  try {
    const result = await client.request('GET', `/2/tweets/${tweetId}`, { queryParams });
    return result;
  } catch (error) {
    throw new Error(`Get tweet failed: ${JSON.stringify(error)}`);
  }
}

module.exports = { postTweet, deleteTweet, getTweet };
