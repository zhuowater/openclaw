const { searchTweets } = require('./lib/search');
const { postTweet, deleteTweet, getTweet } = require('./lib/tweet');
const { getUserByUsername, getUserTimeline } = require('./lib/timeline');
const { likeTweet, unlikeTweet, retweet, undoRetweet, getMe } = require('./lib/engage');

module.exports = {
  // Search
  searchTweets,
  
  // Tweet operations
  postTweet,
  deleteTweet,
  getTweet,
  
  // Timeline
  getUserByUsername,
  getUserTimeline,
  
  // Engagement
  likeTweet,
  unlikeTweet,
  retweet,
  undoRetweet,
  getMe
};
