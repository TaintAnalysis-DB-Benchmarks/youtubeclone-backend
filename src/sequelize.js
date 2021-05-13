const pg = require("pg");
const { Sequelize, DataTypes } = require("sequelize");
const UserModel = require("./models/User");
const VideoModel = require("./models/Video");
const VideoLikeModel = require("./models/VideoLike");
const CommentModel = require("./models/Comment");
const SubscriptionModel = require("./models/Subscription");
const ViewModel = require("./models/View");

pg.defaults.ssl = true;
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  logging: true,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});
(async () => await sequelize.sync({ alter: true }))();

const User = UserModel(sequelize, DataTypes);
const Video = VideoModel(sequelize, DataTypes);
const VideoLike = VideoLikeModel(sequelize, DataTypes);
const Comment = CommentModel(sequelize, DataTypes);
const Subscription = SubscriptionModel(sequelize, DataTypes);
const View = ViewModel(sequelize, DataTypes);

// video - user association
Video.belongsTo(User, { foreignKey: "userId" });

// likes association
User.belongsToMany(Video, { through: VideoLike, foreignKey: "userId" });
Video.belongsToMany(User, { through: VideoLike, foreignKey: "videoId" });

// comments association
User.hasMany(Comment, {
  foreignKey: "userId",
});
Comment.belongsTo(User, { foreignKey: "userId" });

Video.hasMany(Comment, {
  foreignKey: "videoId",
});

// subscription association
User.hasMany(Subscription, {
  foreignKey: "subscribeTo",
});

// views association
User.belongsToMany(Video, { through: View, foreignKey: "userId" });
Video.belongsToMany(User, { through: View, foreignKey: "videoId" });

// Alexi: to fix N+1 count issue, need to explicitly associate the View with the Video.
// This is surprisingly tricky.
// This seems to add videoId to the Video table...
// Video.hasMany(View, { foreignKey: 'videoId' }); // TODO: try videoId? ugh.
// View.belongsTo(Video, { foreignKey: 'id' });

module.exports = {
  User,
  Video,
  VideoLike,
  Comment,
  Subscription,
  View,
  sequelize
};
