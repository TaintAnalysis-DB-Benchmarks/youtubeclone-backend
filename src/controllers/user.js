const { Op, fn } = require("sequelize");
const { VideoLike, Video, User, Subscription, View, sequelize } = require("../sequelize");
const asyncHandler = require("../middlewares/asyncHandler");

exports.toggleSubscribe = asyncHandler(async (req, res, next) => {
  if (req.user.id === req.params.id) {
    return next({
      message: "You cannot to subscribe to your own channel",
      statusCode: 400,
    });
  }

  const user = await User.findByPk(req.params.id);

  if (!user) {
    return next({
      message: `No user found for ID - '${req.params.id}'`,
      statusCode: 404,
    });
  }

  const isSubscribed = await Subscription.findOne({
    where: {
      subscriber: req.user.id,
      subscribeTo: req.params.id,
    },
  });

  if (isSubscribed) {
    await Subscription.destroy({
      where: {
        subscriber: req.user.id,
        subscribeTo: req.params.id,
      },
    });
  } else {
    await Subscription.create({
      subscriber: req.user.id,
      subscribeTo: req.params.id,
    });
  }

  res.status(200).json({ success: true, data: {} });
});

exports.getFeed = asyncHandler(async (req, res, next) => {

  console.log('======= get feed ======');

  const subscribedTo = await Subscription.findAll({
    where: {
      subscriber: req.user.id,
    },
  });

  const subscriptions = subscribedTo.map((sub) => sub.subscribeTo);

  const feed = await Video.findAll({
    include: {
      model: User,
      attributes: ["id", "avatar", "username"],
    },
    where: {
      userId: {
        [Op.in]: subscriptions,
      },
    },
    order: [["createdAt", "DESC"]],
  });

  if (!feed.length) {
    return res.status(200).json({ success: true, data: feed });
  }

  // Doesn't have Select N+1
  let videoIds = [];
  feed.forEach((v, i) => {
    videoIds.push(v.id);
  });
  
  const viewCounts = await View.findAll({
    where: { videoId: videoIds },
    group: ['videoId'],
    attributes: ['videoId', [fn('COUNT', 'videoId'), 'videoCount']]
  });

  feed.forEach(async (video, index) => {

    // No longer needed now that we have pre-fetched.
    // const views = await View.count({ where: { videoId: video.id } });
    // Update the way we access the views.

    let thisViews = viewCounts.filter(v =>
      v.videoId === video.id
    )[0];

    let views = 0;
    if (thisViews)
      views = thisViews.dataValues.videoCount;
    video.setDataValue("views", views);

    if (index === feed.length - 1) {
      return res.status(200).json({ success: true, data: feed });
    }
  });
});

exports.editUser = asyncHandler(async (req, res, next) => {
  await User.update(req.body, {
    where: { id: req.user.id },
  });

  const user = await User.findByPk(req.user.id, {
    attributes: [
      "id",
      "firstname",
      "lastname",
      "username",
      "channelDescription",
      "avatar",
      "cover",
      "email",
    ],
  });

  res.status(200).json({ success: true, data: user });
});

exports.searchUser = asyncHandler(async (req, res, next) => {

  console.log("======== search user ========");

  if (!req.query.searchterm) {
    return next({ message: "Please enter your search term", statusCode: 400 });
  }

  const users = await User.findAll({
    attributes: ["id", "username", "avatar", "channelDescription"],
    where: {
      username: {
        [Op.substring]: req.query.searchterm,
      },
    },
  });

  if (!users.length)
    return res.status(200).json({ success: true, data: users });

  let userIds = [];
  users.forEach(u => userIds.push(u.id));

  // Get all subscriptions.
  // NOTE: make sure to exclude the primary key
  const allSubs = await Subscription.findAll({
    where: { subscribeTo: userIds },
    group: [ 'subscribeTo' ],
    attributes: ['subscribeTo', [fn('COUNT', 'subscribeTo'), 'subsCount']],
  });

  const allVideos = await Video.findAll({
    where: { userId: userIds },
    group: [ 'userId' ],
    attributes: ['userId', [fn('COUNT', 'userId'), 'videosCount']]
  });

  // Naive approach to dealing with inner select:
  const userSubJoin = await User.findAll({
    include: { model: Subscription,
               where: {
                [Op.and]: [{subscriber: req.user.id}, {subscribeTo: userIds}]
               }
              }
  });

  users.forEach(async (user, index) => {

    let thisSubsCount = 0;
    const thisSubs = allSubs.filter(s => s.subscribeTo === user.id)[0];
    if (thisSubs)
      thisSubsCount = thisSubs.dataValues.subsCount;

    const subscribersCount = thisSubsCount;

    let thisVideosCount = 0;
    const thisVideos = allVideos.filter(v => v.userId === user.id)[0];
    if (thisVideos)
      thisVideosCount = thisVideos.dataValues.videosCount;

    const videosCount = thisVideosCount; 

    const isSubscribed = userSubJoin.filter(usj => {
      return usj.dataValues.Subscriptions[0].subscriber === req.user.id &&
      usj.dataValues.Subscriptions[0].subscribeTo === user.id;
    })[0];

    const isMe = req.user.id === user.id;

    user.setDataValue("subscribersCount", subscribersCount);
    user.setDataValue("videosCount", videosCount);
    user.setDataValue("isSubscribed", !!isSubscribed);
    user.setDataValue("isMe", isMe);

    if (index === users.length - 1) {
      return res.status(200).json({ success: true, data: users });
    }
  });
});

exports.getProfile = asyncHandler(async (req, res, next) => {
  const user = await User.findByPk(req.params.id, {
    attributes: [
      "id",
      "firstname",
      "lastname",
      "username",
      "cover",
      "avatar",
      "email",
      "channelDescription",
    ],
  });

  if (!user) {
    return next({
      message: `No user found for ID - ${req.params.id}`,
      statusCode: 404,
    });
  }

  // subscribersCount, isMe, isSubscribed
  const subscribersCount = await Subscription.count({
    where: { subscribeTo: req.params.id },
  });
  user.setDataValue("subscribersCount", subscribersCount);

  const isMe = req.user.id === req.params.id;
  user.setDataValue("isMe", isMe);

  const isSubscribed = await Subscription.findOne({
    where: {
      [Op.and]: [{ subscriber: req.user.id }, { subscribeTo: req.params.id }],
    },
  });
  user.setDataValue("isSubscribed", !!isSubscribed);

  // find the channels this user is subscribed to
  const subscriptions = await Subscription.findAll({
    where: { subscriber: req.params.id },
  });
  const channelIds = subscriptions.map((sub) => sub.subscribeTo);

  const channels = await User.findAll({
    attributes: ["id", "avatar", "username"],
    where: {
      id: { [Op.in]: channelIds },
    },
  });

  const allSubs = await Subscription.findAll({
    where: { subscribeTo: channelIds },
    group: [ 'subscribeTo' ],
    attributes: ['subscribeTo', [fn('COUNT', 'subscribeTo'), 'subsCount']],
  });

  channels.forEach(async (channel) => {
    let thisCount = 0;
    const thisOne = allSubs.filter(s => s.subscribeTo === channel.id)[0];
    if (thisOne) {
      thisCount = thisOne.dataValues.subsCount;
    }

    const subscribersCount = thisCount; /* await Subscription.count({
      where: { subscribeTo: channel.id },
    }); */ 
    channel.setDataValue("subscribersCount", subscribersCount);
  });

  user.setDataValue("channels", channels);

  const videos = await Video.findAll({
    where: { userId: req.params.id },
    attributes: ["id", "thumbnail", "title", "createdAt"],
  });

  const videoIds = videos.map(v => v.id);

  if (!videos.length)
    return res.status(200).json({ success: true, data: user });

  videoViewCounts = await View.findAll({
    where: { videoId: videoIds },
    group: [ 'videoId' ],
    attributes: [ 'videoId', [ fn('COUNT', 'videoId'), 'viewCounts' ]]
  });

  videos.forEach(async (video, index) => {
    let viewCounts = 0;
    const thisViews = videoViewCounts.filter(vvc => vvc.videoId === video.id)[0];
    if (thisViews) {
      viewCounts = thisViews.dataValues.viewCounts;
    }

    const views = viewCounts; /* await View.count({ where: { videoId: video.id } }); */
    video.setDataValue("views", views);

    if (index === videos.length - 1) {
      user.setDataValue("videos", videos);
      return res.status(200).json({ success: true, data: user });
    }
  });
});

exports.recommendedVideos = asyncHandler(async (req, res, next) => {
  console.log('======== recommended ===========')
  const videos = await Video.findAll({
    attributes: [
      "id",
      "title",
      "description",
      "thumbnail",
      "userId",
      "createdAt",
    ],
    include: [{ model: User, attributes: ["id", "avatar", "username"] }],
    order: [["createdAt", "DESC"]],
  });

  if (!videos.length)
    return res.status(200).json({ success: true, data: videos });

  const videoIds = videos.map(v => v.id);

  videoViewCounts = await View.findAll({
    where: { videoId: videoIds },
    group: [ 'videoId' ],
    attributes: [ 'videoId', [ fn('COUNT', 'videoId'), 'viewCounts' ]]
  });

  videos.forEach(async (video, index) => {
    let viewsCount = 0;
    const thisViews = videoViewCounts.filter(vvc => vvc.videoId === video.id)[0];
    if (thisViews)
      viewsCount = thisViews.dataValues.viewCounts;

    const views = viewsCount; /* await View.count({ where: { videoId: video.id } }); */

    video.setDataValue("views", views);

    if (index === videos.length - 1) {
      return res.status(200).json({ success: true, data: videos });
    }
  });
});

exports.recommendChannels = asyncHandler(async (req, res, next) => {
  console.log('=== rec channels ======================================');
  const channels = await User.findAll({
		limit: 10,
    attributes: ["id", "username", "avatar", "channelDescription"],
    where: {
      id: {
        [Op.not]: req.user.id,
      },
    },
  });

  const channelIds = channels.map(c => c.id);
  const subscriptions = await Subscription.findAll({
    where: { subscribeTo: channelIds },
    group: [ 'subscribeTo' ],
    attributes: [ 'subscribeTo', [ fn('COUNT', 'subscribeTo'), 'subscribeToCount' ]]
  });

  if (!channels.length)
    return res.status(200).json({ success: true, data: channels });

  const isSubscribedList = await Subscription.findAll({
    where: {
      subscriber: req.user.id,
      subscribeTo: channelIds
    }
  });

  const videoCounts = await Video.findAll({
    where: { userId: channelIds },
    group: [ 'userId' ],
    attributes: [ 'userId', [fn('COUNT', 'userId'), 'userIdCount']]
  });

  channels.forEach(async (channel, index) => {
    let subsCount = 0;
    const thisSubs = subscriptions.filter(s => s.subscribeTo === channel.id)[0];
    if (thisSubs)
      subsCount = thisSubs.dataValues.subscribeToCount;

    const subscribersCount = subsCount; /* await Subscription.count({
      where: { subscribeTo: channel.id },
    }); */
    channel.setDataValue("subscribersCount", subscribersCount);

    const isSubscribed = isSubscribedList.filter(e => e.subscriber === req.user.id && e.subscribeTo === channel.id);
    /* const isSubscribed = await Subscription.findOne({
      where: {
        subscriber: req.user.id,
        subscribeTo: channel.id,
      },
    }); */

    channel.setDataValue("isSubscribed", !!isSubscribed);

    let userIdCount = 0;
    const thisVideo = videoCounts.filter(vc => vc.userId === channel.id)[0];
    if (thisVideo) 
      userIdCount = thisVideo.dataValues.userIdCount;

    const videosCount = userIdCounts; /* await Video.count({ where: { userId: channel.id } }); */
    channel.setDataValue("videosCount", videosCount);

    if (index === channels.length - 1) {
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
  console.log('getVideos =================================');
  const videoRelations = await model.findAll({
    where: { userId: req.user.id },
    order: [["createdAt", "ASC"]],
  });

  const videoIds = videoRelations.map((videoRelation) => videoRelation.videoId);

  const videos = await Video.findAll({
    attributes: ["id", "title", "description", "createdAt", "thumbnail", "url"],
    include: {
      model: User,
      attributes: ["id", "username", "avatar"],
    },
    where: {
      id: {
        [Op.in]: videoIds,
      },
    },
  });

  if (!videos.length) {
    return res.status(200).json({ success: true, data: videos });
  }

  const videoViewCounts = await View.findAll({
    where: { videoId: videoIds },
    group: [ 'videoId' ],
    attributes: [ 'videoId', [ fn('COUNT', 'videoId'), 'viewCounts' ]]
  });

  videos.forEach(async (video, index) => {
    let viewCounts = 0;
    const thisViews = videoViewCounts.filter(e => e.videoId === video.id)[0];
    if (thisViews)
      viewCounts = thisViews.dataValues.viewCounts;

    const views = viewCounts; /* await View.count({ where: { videoId: video.id } }); */
    video.setDataValue("views", views);

    if (index === videos.length - 1) {
      return res.status(200).json({ success: true, data: videos });
    }
  });
};
