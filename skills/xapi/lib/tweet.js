const XAPIClient = require('./client');

/**
 * Serialize error for logging (handles Error instances, plain objects, strings)
 */
function serializeError(error) {
  if (error instanceof Error) {
    const obj = { message: error.message, name: error.name };
    if (error.code) obj.code = error.code;
    if (error.statusCode) obj.statusCode = error.statusCode;
    if (error.cause) obj.cause = serializeError(error.cause);
    if (error.stack) obj.stack = error.stack.split('\n').slice(0, 3).join('\n');
    return JSON.stringify(obj);
  }
  if (typeof error === 'object' && error !== null) {
    return JSON.stringify(error);
  }
  return String(error);
}

/**
 * Post a tweet (supports Premium long tweets up to 25,000 chars)
 */
async function postTweet(text, options = {}) {
  const client = new XAPIClient();
  const { mediaPath, replyToId, quoteTweetId } = options;

  const body = { text };

  // Upload media if provided
  if (mediaPath) {
    try {
      const mediaResult = await client.uploadMedia(mediaPath);
      body.media = {
        media_ids: [mediaResult.media_id_string]
      };
    } catch (error) {
      throw new Error(`Media upload failed: ${serializeError(error)}`);
    }
  }

  // Reply to another tweet
  if (replyToId) {
    body.reply = {
      in_reply_to_tweet_id: replyToId
    };
  }

  // Quote tweet
  if (quoteTweetId) {
    body.quote_tweet_id = quoteTweetId;
  }

  try {
    const result = await client.request('POST', '/2/tweets', { body });
    return result;
  } catch (error) {
    throw new Error(`Post tweet failed: ${serializeError(error)}`);
  }
}

/**
 * Post a thread (array of texts, each can be long with Premium)
 * Returns array of tweet results
 */
async function postThread(texts, options = {}) {
  const results = [];
  let lastTweetId = null;

  for (let i = 0; i < texts.length; i++) {
    const tweetOptions = {};
    if (lastTweetId) {
      tweetOptions.replyToId = lastTweetId;
    }
    // First tweet can have media
    if (i === 0 && options.mediaPath) {
      tweetOptions.mediaPath = options.mediaPath;
    }

    const result = await postTweet(texts[i], tweetOptions);
    results.push(result);
    lastTweetId = result.data?.id;

    // Small delay between tweets to avoid rate limiting
    if (i < texts.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  return results;
}

/**
 * Post a long article as a thread (auto-splits at paragraph boundaries)
 * Premium accounts can post up to 25,000 chars per tweet
 * For really long content, splits into multiple tweets
 */
async function postArticle(title, content, options = {}) {
  const MAX_CHARS = 20000; // Safe limit under 25K
  const { hashtags = [], mediaPath } = options;

  // Build hashtag string
  const tagStr = hashtags.length ? '\n\n' + hashtags.map(t => t.startsWith('#') ? t : '#' + t).join(' ') : '';

  // First tweet: title + beginning of content
  const fullText = `${title}\n\n${content}${tagStr}`;

  if (fullText.length <= MAX_CHARS) {
    // Fits in one tweet
    return postTweet(fullText, { mediaPath });
  }

  // Split into thread at paragraph boundaries
  const paragraphs = content.split('\n\n');
  const tweets = [];
  let current = title + '\n\n';

  for (const para of paragraphs) {
    if ((current + para + '\n\n').length > MAX_CHARS) {
      tweets.push(current.trim());
      current = '';
    }
    current += para + '\n\n';
  }
  if (current.trim()) {
    // Add hashtags to last tweet
    tweets.push(current.trim() + tagStr);
  }

  // Number the tweets
  const numbered = tweets.map((t, i) => tweets.length > 1 ? `[${i + 1}/${tweets.length}] ${t}` : t);

  return postThread(numbered, { mediaPath });
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
    throw new Error(`Delete tweet failed: ${serializeError(error)}`);
  }
}

/**
 * Get a single tweet
 */
async function getTweet(tweetId) {
  const client = new XAPIClient();

  const queryParams = {
    'tweet.fields': 'created_at,author_id,public_metrics,entities,referenced_tweets,note_tweet',
    'user.fields': 'name,username,verified',
    expansions: 'author_id,referenced_tweets.id'
  };

  try {
    const result = await client.request('GET', `/2/tweets/${tweetId}`, { queryParams });
    return result;
  } catch (error) {
    throw new Error(`Get tweet failed: ${serializeError(error)}`);
  }
}

/**
 * Bookmark a tweet (Premium feature)
 */
async function bookmarkTweet(tweetId, userId) {
  const client = new XAPIClient();
  try {
    const result = await client.request('POST', `/2/users/${userId}/bookmarks`, {
      body: { tweet_id: tweetId }
    });
    return result;
  } catch (error) {
    throw new Error(`Bookmark failed: ${serializeError(error)}`);
  }
}

/**
 * Get bookmarks (Premium feature)
 */
async function getBookmarks(userId, options = {}) {
  const client = new XAPIClient();
  const { limit = 20 } = options;
  try {
    const result = await client.request('GET', `/2/users/${userId}/bookmarks`, {
      queryParams: {
        max_results: Math.min(limit, 100),
        'tweet.fields': 'created_at,author_id,public_metrics,note_tweet',
        expansions: 'author_id'
      }
    });
    return result;
  } catch (error) {
    throw new Error(`Get bookmarks failed: ${serializeError(error)}`);
  }
}

/**
 * Follow a user
 */
async function followUser(targetUserId, myUserId) {
  const client = new XAPIClient();
  try {
    const result = await client.request('POST', `/2/users/${myUserId}/following`, {
      body: { target_user_id: targetUserId }
    });
    return result;
  } catch (error) {
    throw new Error(`Follow failed: ${serializeError(error)}`);
  }
}

/**
 * Unfollow a user
 */
async function unfollowUser(targetUserId, myUserId) {
  const client = new XAPIClient();
  try {
    const result = await client.request('DELETE', `/2/users/${myUserId}/following/${targetUserId}`);
    return result;
  } catch (error) {
    throw new Error(`Unfollow failed: ${serializeError(error)}`);
  }
}

/**
 * Get user followers
 */
async function getFollowers(userId, options = {}) {
  const client = new XAPIClient();
  const { limit = 100 } = options;
  try {
    const result = await client.request('GET', `/2/users/${userId}/followers`, {
      queryParams: {
        max_results: Math.min(limit, 1000),
        'user.fields': 'description,public_metrics,verified'
      }
    });
    return result;
  } catch (error) {
    throw new Error(`Get followers failed: ${serializeError(error)}`);
  }
}

/**
 * Get user following
 */
async function getFollowing(userId, options = {}) {
  const client = new XAPIClient();
  const { limit = 100 } = options;
  try {
    const result = await client.request('GET', `/2/users/${userId}/following`, {
      queryParams: {
        max_results: Math.min(limit, 1000),
        'user.fields': 'description,public_metrics,verified'
      }
    });
    return result;
  } catch (error) {
    throw new Error(`Get following failed: ${serializeError(error)}`);
  }
}

module.exports = {
  postTweet, postThread, postArticle,
  deleteTweet, getTweet,
  bookmarkTweet, getBookmarks,
  followUser, unfollowUser,
  getFollowers, getFollowing
};
