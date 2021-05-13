const { Op, ConnectionTimedOutError, fn } = require("sequelize");
const {
  User,
  Video,
  VideoLike,
  Comment,
  View,
  Subscription,
  sequelize
} = require("../sequelize");
const asyncHandler = require("../middlewares/asyncHandler");

// Performance hooks.
// const { PerformanceObserver, performance } = require('perf_hooks');
// const obs = new PerformanceObserver((items) => {
//   console.log(items);
//   performance.clearMarks();
// });
// obs.observe({ type: 'measure' });

exports.newVideo = asyncHandler(async (req, res, next) => {
  const video = await Video.create({
    ...req.body,
    userId: req.user.id,
  });

  res.status(200).json({ success: true, data: video });
});

exports.getVideo = asyncHandler(async (req, res, next) => {
  const video = await Video.findByPk(req.params.id, {
    include: [
      {
        model: User,
        attributes: ["id", "username", "avatar"],
      },
    ],
  });

  if (!video) {
    return next({
      message: `No video found for ID - ${req.params.id}`,
      statusCode: 404,
    });
  }

  const comments = await video.getComments({
    order: [["createdAt", "DESC"]],
    attributes: ["id", "text", "createdAt"],
    include: [
      {
        model: User,
        attributes: ["id", "username", "avatar"],
      },
    ],
  });

  const isLiked = await VideoLike.findOne({
    where: {
      [Op.and]: [
        { videoId: req.params.id },
        { userId: req.user.id },
        { like: 1 },
      ],
    },
  });

  const isDisliked = await VideoLike.findOne({
    where: {
      [Op.and]: [
        { videoId: req.params.id },
        { userId: req.user.id },
        { like: -1 },
      ],
    },
  });

  const commentsCount = await Comment.count({
    where: {
      videoId: req.params.id,
    },
  });

  const likesCount = await VideoLike.count({
    where: {
      [Op.and]: [{ videoId: req.params.id }, { like: 1 }],
    },
  });

  const dislikesCount = await VideoLike.count({
    where: {
      [Op.and]: [{ videoId: req.params.id }, { like: -1 }],
    },
  });

  const views = await View.count({
    where: {
      videoId: req.params.id,
    },
  });

  const isSubscribed = await Subscription.findOne({
    where: {
      subscriber: req.user.id,
      subscribeTo: video.userId,
    },
  });

  const isViewed = await View.findOne({
    where: {
      userId: req.user.id,
      videoId: video.id,
    },
  });

  const subscribersCount = await Subscription.count({
    where: { subscribeTo: video.userId },
  });

  const isVideoMine = req.user.id === video.userId;

  // likesCount, disLikesCount, views
  video.setDataValue("comments", comments);
  video.setDataValue("commentsCount", commentsCount);
  video.setDataValue("isLiked", !!isLiked);
  video.setDataValue("isDisliked", !!isDisliked);
  video.setDataValue("likesCount", likesCount);
  video.setDataValue("dislikesCount", dislikesCount);
  video.setDataValue("views", views);
  video.setDataValue("isVideoMine", isVideoMine);
  video.setDataValue("isSubscribed", !!isSubscribed);
  video.setDataValue("isViewed", !!isViewed);
  video.setDataValue("subscribersCount", subscribersCount);

  res.status(200).json({ success: true, data: video });
});

exports.likeVideo = asyncHandler(async (req, res, next) => {
  const video = await Video.findByPk(req.params.id);

  if (!video) {
    return next({
      message: `No video found for ID - ${req.params.id}`,
      statusCode: 404,
    });
  }

  const liked = await VideoLike.findOne({
    where: {
      userId: req.user.id,
      videoId: req.params.id,
      like: 1,
    },
  });

  const disliked = await VideoLike.findOne({
    where: {
      userId: req.user.id,
      videoId: req.params.id,
      like: -1,
    },
  });

  if (liked) {
    await liked.destroy();
  } else if (disliked) {
    disliked.like = 1;
    await disliked.save();
  } else {
    await VideoLike.create({
      userId: req.user.id,
      videoId: req.params.id,
      like: 1,
    });
  }

  res.json({ success: true, data: {} });
});

exports.dislikeVideo = asyncHandler(async (req, res, next) => {
  const video = await Video.findByPk(req.params.id);

  if (!video) {
    return next({
      message: `No video found for ID - ${req.params.id}`,
      statusCode: 404,
    });
  }

  const liked = await VideoLike.findOne({
    where: {
      userId: req.user.id,
      videoId: req.params.id,
      like: 1,
    },
  });

  const disliked = await VideoLike.findOne({
    where: {
      userId: req.user.id,
      videoId: req.params.id,
      like: -1,
    },
  });

  if (disliked) {
    await disliked.destroy();
  } else if (liked) {
    liked.like = -1;
    await liked.save();
  } else {
    await VideoLike.create({
      userId: req.user.id,
      videoId: req.params.id,
      like: -1,
    });
  }

  res.json({ success: true, data: {} });
});

exports.addComment = asyncHandler(async (req, res, next) => {
  const video = await Video.findByPk(req.params.id);

  if (!video) {
    return next({
      message: `No video found for ID - ${req.params.id}`,
      statusCode: 404,
    });
  }

  const comment = await Comment.create({
    text: req.body.text,
    userId: req.user.id,
    videoId: req.params.id,
  });

  const User = {
    id: req.user.id,
    avatar: req.user.avatar,
    username: req.user.username,
  };

  comment.setDataValue("User", User);

  res.status(200).json({ success: true, data: comment });
});

exports.newView = asyncHandler(async (req, res, next) => {
  const video = await Video.findByPk(req.params.id);

  if (!video) {
    return next({
      message: `No video found for ID - ${req.params.id}`,
      statusCode: 404,
    });
  }

  const viewed = await View.findOne({
    where: {
      userId: req.user.id,
      videoId: req.params.id,
    },
  });

  if (viewed) {
    return next({ message: "You already viewed this video", statusCode: 400 });
  }

  await View.create({
    userId: req.user.id,
    videoId: req.params.id,
  });

  res.status(200).json({ success: true, data: {} });
});

// // No Select-1-Count-N, Select-1-Count-1
// exports.searchVideo = asyncHandler(async (req, res, next) => {
//   console.time('search');
//   if (!req.query.searchterm) {
//     return next({ message: "Please enter the searchterm", statusCode: 400 });
//   }

//   const videos = await Video.findAll({
//     include: { model: User, attributes: ["id", "avatar", "username"] },
//     where: {
//       [Op.or]: {
//         title: {
//           [Op.substring]: req.query.searchterm,
//         },
//         description: {
//           [Op.substring]: req.query.searchterm,
//         },
//       },
//     },
//   });

//   if (!videos.length)
//     return res.status(200).json({ success: true, data: videos });

//   // Doesn't have Select N+1
//   let videoIds = [];
//   videos.forEach((v, i) => {
//     videoIds.push(v.id);
//   });
  
//   const viewCounts = await View.findAll({
//     where: { videoId: videoIds },
//     group: ['videoId'],
//     attributes: ['videoId', [fn('COUNT', 'videoId'), 'videoCount']]
//   });

//   videos.forEach(async (video, index) => {
//     // No longer needed now that we have pre-fetched.
//     // const views = await View.count({ where: { videoId: video.id } });
//     // Update the way we access the views.

//     let thisViews = viewCounts.filter(v =>
//       v.videoId === video.id
//     )[0];

//     let views = 0;
//     if (thisViews)
//       views = thisViews.dataValues.videoCount;

//     video.setDataValue("views", views);

//     if (index === videos.length - 1) {
//       console.timeEnd('search');
//       return res.status(200).json({ success: true, data: videos });
//     }
//   });
// });

// The Select-1-Count-N way.
exports.searchVideo = asyncHandler(async (req, res, next) => {
  // performance.mark('search-start');
  console.time('search');
  if (!req.query.searchterm) {
    return next({ message: "Please enter the searchterm", statusCode: 400 });
  }

  const videos = await Video.findAll({
    include: { model: User, attributes: ["id", "avatar", "username"] },
    where: {
      [Op.or]: {
        title: {
          [Op.substring]: req.query.searchterm,
        },
        description: {
          [Op.substring]: req.query.searchterm,
        },
      },
    },
  });

  if (!videos.length)
    return res.status(200).json({ success: true, data: videos });

  videos.forEach(async (video, index) => {
    const views = await View.count({ where: { videoId: video.id } });
    video.setDataValue("views", views);

    if (index === videos.length - 1) {
      // performance.measure('search start to end', 'search-start');
      console.timeEnd('search');
      return res.status(200).json({ success: true, data: videos });
    }
  });
});

/* Graveyard */

// This is a convoluted way to do a join to get the counts.
// Because Views is a join table, Sequelize is not aware of an association
// between Videos and Views
/*
exports.searchVideo = asyncHandler(async (req, res, next) => {
  if (!req.query.searchterm) {
    return next({ message: "Please enter the searchterm", statusCode: 400 });
  }

  console.log('Before query...');

  const videos = await Video.findAll({
    include: [{ model: User,
                attributes: ["id", "avatar", "username"] }],// , 
              // { model: View, attributes: ['videoId'] }],
    where: {
      [Op.or]: {
        title: {
          [Op.substring]: req.query.searchterm,
        },
        description: {
          [Op.substring]: req.query.searchterm,
        },
      },
    },
    // Group by 'videoId', which is what is used below.
    // group: ['Video.id'],
    // Count up by videoId.
    // attributes: ['View.videoId', [fn('COUNT', 'View.videoId'), 'View.viewCount']]
    // attributes: ['Video.id', [fn('COUNT', 'Video.id'), '\"Video\".\"viewCount\"']]
  });

  console.log(videos);

  const views = await View.findAll({
    group: ['videoId'],
    attributes: ['videoId', [fn('COUNT', 'videoId'), 'viewCount']]
  });

  console.log(views);

  console.log('by hand');

  // const [a, crap] = sequelize.query('SELECT "Video"."id", COUNT(\'Views.videoId\') AS "viewCount", "Views"."videoId" AS "Views.videoId" FROM "Videos" AS "Video" LEFT OUTER JOIN "Views" AS "Views" ON "Video"."id" = "Views"."videoId" GROUP BY "Video"."id"');

  // console.log(a);

  console.log("Sequelize PLEASE")

  // This works, but raw: true is required, and messes with the type of 
  // videosAndViews (it is no longer a sequelize object (sad))
  const videosAndViews = await Video.findAll({
    include: { model: View,
               attributes: ['videoId'] }, 
    group: ['Views.videoId'],
    attributes: [[fn('COUNT', 'Views.videoId'), 'viewCount']],
    raw: true
  });

  console.log(videosAndViews);

  if (!videos.length)
    return res.status(200).json({ success: true, data: videos });

  // Doesn't have Select N+1, and is nicer than the alternative.
  videos.forEach(async (video, index) => {
    // No longer needed now that we have pre-fetched.
    const views = await View.count({ where: { videoId: video.id } });
    // Update the way we access the views.

    video.setDataValue("views", views);

    if (index === videos.length - 1) {
      return res.status(200).json({ success: true, data: videos });
    }
  });
});
*/