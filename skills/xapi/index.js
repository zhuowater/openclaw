const { searchTweets } = require('./lib/search');
const { postTweet, postThread, postArticle, deleteTweet, getTweet, bookmarkTweet, getBookmarks, followUser, unfollowUser, getFollowers, getFollowing } = require('./lib/tweet');
const { getUserByUsername, getUserTimeline } = require('./lib/timeline');
const { likeTweet, unlikeTweet, retweet, undoRetweet, getMe } = require('./lib/engage');

module.exports = {
  // Search
  searchTweets,
  
  // Tweet operations (Premium: long tweets up to 25K chars)
  postTweet,
  postThread,
  postArticle,
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
  getMe,
  
  // Premium features
  bookmarkTweet,
  getBookmarks,
  
  // Social graph
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing
};
