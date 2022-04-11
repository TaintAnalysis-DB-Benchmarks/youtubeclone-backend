const Sequelize = require("sequelize");

const {
  Op
} = require("sequelize");

const {
  VideoLike,
  Video,
  User,
  Subscription,
  View
} = require("../sequelize");

const asyncHandler = require("../middlewares/asyncHandler");

// Performance Stuff.
const { performance } = require('perf_hooks');

exports.toggleSubscribe = asyncHandler(async (req, res, next) => {
  if (req.user.id === req.params.id) {
    return next({
      message: "You cannot to subscribe to your own channel",
      statusCode: 400
    });
  }

  const user = await User.findByPk(req.params.id);

  if (!user) {
    return next({
      message: `No user found for ID - '${req.params.id}'`,
      statusCode: 404
    });
  }

  const isSubscribed = await Subscription.findOne({
    where: {
      subscriber: req.user.id,
      subscribeTo: req.params.id
    }
  });

  if (isSubscribed) {
    await Subscription.destroy({
      where: {
        subscriber: req.user.id,
        subscribeTo: req.params.id
      }
    });
  } else {
    await Subscription.create({
      subscriber: req.user.id,
      subscribeTo: req.params.id
    });
  }

  res.status(200).json({
    success: true,
    data: {}
  });
});
exports.getFeed = asyncHandler(async (req, res, next) => {
  console.log('==================== getFeed // start ====================');
  const fnStart = performance.now();
  const subscribedTo = await Subscription.findAll({
    where: {
      subscriber: req.user.id
    }
  });
  const subscriptions = subscribedTo.map(sub => sub.subscribeTo);
  const feed = await Video.findAll({
    include: {
      model: User,
      attributes: ["id", "avatar", "username"]
    },
    where: {
      userId: {
        [Op.in]: subscriptions
      }
    },
    order: [["createdAt", "DESC"]]
  });

  if (!feed.length) {
    return res.status(200).json({
      success: true,
      data: feed
    });
  }

  const viewCounts = await View.findAll({
    where: {
      videoId: feed.map(r => r.id)
    },
    group: "View.videoId",
    attributes: ["videoId", [Sequelize.fn("COUNT", Sequelize.col("View.videoId")), "viewCount"]]
  });
  feed.forEach(async (video, index) => {
    const viewCounts_tmp = viewCounts.find(r => r.videoId === video.id);
    const views = viewCounts_tmp === undefined ? 0 : viewCounts_tmp.dataValues.viewCount;
    video.setDataValue("views", views);

    if (index === feed.length - 1) {
      const fnEnd = performance.now();
      console.log('====================  getFeed // end  ====================');
      console.log(fnEnd - fnStart);
      return res.status(200).json({ success: true, data: feed });

    }
  });
});
exports.editUser = asyncHandler(async (req, res, next) => {
  await User.update(req.body, {
    where: {
      id: req.user.id
    }
  });
  const user = await User.findByPk(req.user.id, {
    attributes: ["id", "firstname", "lastname", "username", "channelDescription", "avatar", "cover", "email"]
  });
  res.status(200).json({
    success: true,
    data: user
  });
});
exports.searchUser = asyncHandler(async (req, res, next) => {
  console.log('==================== searchUser // start ====================');
  const fnStart = performance.now();
  if (!req.query.searchterm) {
    return next({
      message: "Please enter your search term",
      statusCode: 400
    });
  }

  const users = await User.findAll({
    attributes: ["id", "username", "avatar", "channelDescription"],
    where: {
      username: {
        [Op.substring]: req.query.searchterm
      }
    }
  });
  if (!users.length) return res.status(200).json({
    success: true,
    data: users
  });
  const subscriptions = await Subscription.findAll({
    where: {
      [Op.and]: [{
        subscriber: req.user.id
      }, {
        subscribeTo: users.map(u => u.id)
      }]
    }
  });
  const subscriptionCounts = await Subscription.findAll({
    where: {
      subscribeTo: users.map(r => r.id)
    },
    group: "Subscription.subscribeTo",
    attributes: ["subscribeTo", [Sequelize.fn("COUNT", Sequelize.col("Subscription.subscribeTo")), "subscriptionCount"]]
  });
  const videoCounts = await Video.findAll({
    where: {
      userId: users.map(r => r.id)
    },
    group: "Video.userId",
    attributes: ["userId", [Sequelize.fn("COUNT", Sequelize.col("Video.userId")), "videoCount"]]
  });
  users.forEach(async (user, index) => {
    const subscriptionCounts_tmp = subscriptionCounts.find(r => r.subscribeTo === user.id);
    const subscribersCount = subscriptionCounts_tmp === undefined ? 0 : subscriptionCounts_tmp.dataValues.subscriptionCount;
    const videoCounts_tmp = videoCounts.find(r => r.userId === user.id);
    const videosCount = videoCounts_tmp === undefined ? 0 : videoCounts_tmp.dataValues.videoCount;
    const isSubscribed = subscriptions.find(data => data.subscribeTo === user.id);
    const isMe = req.user.id === user.id;
    user.setDataValue("subscribersCount", subscribersCount);
    user.setDataValue("videosCount", videosCount);
    user.setDataValue("isSubscribed", !!isSubscribed);
    user.setDataValue("isMe", isMe);

    if (index === users.length - 1) {
      const fnEnd = performance.now();
      console.log('====================  searchUser // end  ====================');
      console.log(fnEnd - fnStart);
      return res.status(200).json({ success: true, data: users });
    }
  });
});
exports.getProfile = asyncHandler(async (req, res, next) => {
  console.log('==================== getProfile // start ====================');
  const fnStart = performance.now();
  const user = await User.findByPk(req.params.id, {
    attributes: ["id", "firstname", "lastname", "username", "cover", "avatar", "email", "channelDescription"]
  });

  if (!user) {
    return next({
      message: `No user found for ID - ${req.params.id}`,
      statusCode: 404
    });
  } // subscribersCount, isMe, isSubscribed


  const subscribersCount = await Subscription.count({
    where: {
      subscribeTo: req.params.id
    }
  });
  user.setDataValue("subscribersCount", subscribersCount);
  const isMe = req.user.id === req.params.id;
  user.setDataValue("isMe", isMe);
  const isSubscribed = await Subscription.findOne({
    where: {
      [Op.and]: [{
        subscriber: req.user.id
      }, {
        subscribeTo: req.params.id
      }]
    }
  });
  user.setDataValue("isSubscribed", !!isSubscribed); // find the channels this user is subscribed to

  const subscriptions = await Subscription.findAll({
    where: {
      subscriber: req.params.id
    }
  });
  const channelIds = subscriptions.map(sub => sub.subscribeTo);
  const channels = await User.findAll({
    attributes: ["id", "avatar", "username"],
    where: {
      id: {
        [Op.in]: channelIds
      }
    }
  });
  const subscriptionCounts = await Subscription.findAll({
    where: {
      subscribeTo: channels.map(r => r.id)
    },
    group: "Subscription.subscribeTo",
    attributes: ["subscribeTo", [Sequelize.fn("COUNT", Sequelize.col("Subscription.subscribeTo")), "subscriptionCount"]]
  });
  channels.forEach(async channel => {
    const subscriptionCounts_tmp = subscriptionCounts.find(r => r.subscribeTo === channel.id);
    const subscribersCount = subscriptionCounts_tmp === undefined ? 0 : subscriptionCounts_tmp.dataValues.subscriptionCount;
    channel.setDataValue("subscribersCount", subscribersCount);
  });
  user.setDataValue("channels", channels);
  const videos = await Video.findAll({
    where: {
      userId: req.params.id
    },
    attributes: ["id", "thumbnail", "title", "createdAt"]
  });
  if (!videos.length) return res.status(200).json({
    success: true,
    data: user
  });
  const viewCounts = await View.findAll({
    where: {
      videoId: videos.map(r => r.id)
    },
    group: "View.videoId",
    attributes: ["videoId", [Sequelize.fn("COUNT", Sequelize.col("View.videoId")), "viewCount"]]
  });
  videos.forEach(async (video, index) => {
    const viewCounts_tmp = viewCounts.find(r => r.videoId === video.id);
    const views = viewCounts_tmp === undefined ? 0 : viewCounts_tmp.dataValues.viewCount;
    video.setDataValue("views", views);

    if (index === videos.length - 1) {
      user.setDataValue("videos", videos);
      const fnEnd = performance.now();
      console.log('====================  getProfile // end  ====================');
      console.log(fnEnd - fnStart);
      return res.status(200).json({ success: true, data: user });
    }
  });
});
exports.recommendedVideos = asyncHandler(async (req, res, next) => {
  console.log('==================== recommendVideos // start ====================');
  const fnStart = performance.now();
  const videos = await Video.findAll({
    attributes: ["id", "title", "description", "thumbnail", "userId", "createdAt"],
    include: [{
      model: User,
      attributes: ["id", "avatar", "username"]
    }],
    order: [["createdAt", "DESC"]]
  });
  if (!videos.length) return res.status(200).json({
    success: true,
    data: videos
  });
  const viewCounts = await View.findAll({
    where: {
      videoId: videos.map(r => r.id)
    },
    group: "View.videoId",
    attributes: ["videoId", [Sequelize.fn("COUNT", Sequelize.col("View.videoId")), "viewCount"]]
  });
  videos.forEach(async (video, index) => {
    const viewCounts_tmp = viewCounts.find(r => r.videoId === video.id);
    const views = viewCounts_tmp === undefined ? 0 : viewCounts_tmp.dataValues.viewCount;
    video.setDataValue("views", views);

    if (index === videos.length - 1) {
      const fnEnd = performance.now();
      console.log('====================  recommendVideos // end  ====================');
      console.log(fnEnd - fnStart);
      return res.status(200).json({ success: true, data: videos });
    }
  });
});
exports.recommendChannels = asyncHandler(async (req, res, next) => {
  console.log('==================== recommendChannels // start ====================');
  const fnStart = performance.now();
  const channels = await User.findAll({
    limit: 10,
    attributes: ["id", "username", "avatar", "channelDescription"],
    where: {
      id: {
        [Op.not]: req.user.id
      }
    }
  });
  if (!channels.length) return res.status(200).json({
    success: true,
    data: channels
  });
  const subscriptions = await Subscription.findAll({
    where: {
      subscriber: req.user.id,
      subscribeTo: channels.map(u => u.id)
    }
  });
  const subscriptionCounts = await Subscription.findAll({
    where: {
      subscribeTo: channels.map(r => r.id)
    },
    group: "Subscription.subscribeTo",
    attributes: ["subscribeTo", [Sequelize.fn("COUNT", Sequelize.col("Subscription.subscribeTo")), "subscriptionCount"]]
  });
  const videoCounts = await Video.findAll({
    where: {
      userId: channels.map(r => r.id)
    },
    group: "Video.userId",
    attributes: ["userId", [Sequelize.fn("COUNT", Sequelize.col("Video.userId")), "videoCount"]]
  });
  channels.forEach(async (channel, index) => {
    const subscriptionCounts_tmp = subscriptionCounts.find(r => r.subscribeTo === channel.id);
    const subscribersCount = subscriptionCounts_tmp === undefined ? 0 : subscriptionCounts_tmp.dataValues.subscriptionCount;
    channel.setDataValue("subscribersCount", subscribersCount);
    const isSubscribed = subscriptions.find(data => data.subscribeTo === channel.id);
    channel.setDataValue("isSubscribed", !!isSubscribed);
    const videoCounts_tmp = videoCounts.find(r => r.userId === channel.id);
    const videosCount = videoCounts_tmp === undefined ? 0 : videoCounts_tmp.dataValues.videoCount;
    channel.setDataValue("videosCount", videosCount);

    if (index === channels.length - 1) {
      const fnEnd = performance.now();
      console.log('====================  recommendChannels // end  ====================');
      console.log(fnEnd - fnStart);
      return res.status(200).json({ success: true, data: channels });
    }
  });
});
exports.getLikedVideos = asyncHandler(async (req, res, next) => {
  return getVideos(VideoLike, req, res, next);
});
exports.getHistory = asyncHandler(async (req, res, next) => {
  return getVideos(View, req, res, next);
});

const getVideos = async (model, req, res, next) => {
  console.log('==================== getVideos // start ====================');
  const fnStart = performance.now();
  const videoRelations = await model.findAll({
    where: {
      userId: req.user.id
    },
    order: [["createdAt", "ASC"]]
  });
  const videoIds = videoRelations.map(videoRelation => videoRelation.videoId);
  const videos = await Video.findAll({
    attributes: ["id", "title", "description", "createdAt", "thumbnail", "url"],
    include: {
      model: User,
      attributes: ["id", "username", "avatar"]
    },
    where: {
      id: {
        [Op.in]: videoIds
      }
    }
  });

  if (!videos.length) {
    return res.status(200).json({
      success: true,
      data: videos
    });
  }

  const viewCounts = await View.findAll({
    where: {
      videoId: videos.map(r => r.id)
    },
    group: "View.videoId",
    attributes: ["videoId", [Sequelize.fn("COUNT", Sequelize.col("View.videoId")), "viewCount"]]
  });
  videos.forEach(async (video, index) => {
    const viewCounts_tmp = viewCounts.find(r => r.videoId === video.id);
    const views = viewCounts_tmp === undefined ? 0 : viewCounts_tmp.dataValues.viewCount;
    video.setDataValue("views", views);

    if (index === videos.length - 1) {
      const fnEnd = performance.now();
      console.log('====================  getVideos // end  ====================');
      console.log(fnEnd - fnStart);
      return res.status(200).json({ success: true, data: videos });
    }
  });
};