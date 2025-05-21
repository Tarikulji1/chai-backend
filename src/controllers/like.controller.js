import mongoose, {isValidObjectId} from "mongoose"
import {Like} from "../models/like.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import {Video} from "../models/video.model.js"
import {Comment} from "../models/comment.model.js"
import {Tweet} from "../models/tweet.model.js"

const toggleVideoLike = asyncHandler(async (req, res) => {
    //TODO: toggle like on video
    const {videoId} = req.params;
    const likedBy = req.user?._id; // Assuming req.user is populated by auth middleware

    if (!likedBy) {
        throw new ApiError(401, "Unauthorized: User not logged in");
    }
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    // Check if video exists
    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    const likeCondition = { video: videoId, likedBy: likedBy };
    const existingLike = await Like.findOne(likeCondition);

    let message;
    if (existingLike) {
        // If liked, unlike it
        await Like.findByIdAndDelete(existingLike._id);
        message = "Video unliked successfully";
    } else {
        // If not liked, like it
        await Like.create(likeCondition);
        message = "Video liked successfully";
    }

    // You might want to return the updated like count or a status indicating the change
    // For simplicity, we are just returning a success message.

    return res
        .status(200)
        .json(new ApiResponse(
            200, 
            { isLiked: !existingLike }, // Indicate the new like status 
            message
        ));
});

const toggleCommentLike = asyncHandler(async (req, res) => {
    //TODO: toggle like on comment
    const {commentId} = req.params;
    const likedBy = req.user?._id;

    if (!likedBy) {
        throw new ApiError(401, "Unauthorized: User not logged in");
    }
    if (!isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid comment ID");
    }

    // Check if comment exists
    const comment = await Comment.findById(commentId);
    if (!comment) {
        throw new ApiError(404, "Comment not found");
    }

    const likeCondition = { comment: commentId, likedBy: likedBy };
    const existingLike = await Like.findOne(likeCondition);

    let message;
    if (existingLike) {
        // If liked, unlike it
        await Like.findByIdAndDelete(existingLike._id);
        message = "Comment unliked successfully";
    } else {
        // If not liked, like it
        await Like.create(likeCondition);
        message = "Comment liked successfully";
    }

    return res
        .status(200)
        .json(new ApiResponse(
            200,
            { isLiked: !existingLike },
            message
        ));    

})

const toggleTweetLike = asyncHandler(async (req, res) => {
    //TODO: toggle like on tweet
    const {tweetId} = req.params;
    const likedBy = req.user?._id;

    if (!likedBy) {
        throw new ApiError(401, "Unauthorized: User not logged in");
    }
    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweet ID");
    }

    // Check if tweet exists
    const tweet = await Tweet.findById(tweetId); // Assuming Tweet model exists
    if (!tweet) {
        throw new ApiError(404, "Tweet not found");
    }

    const likeCondition = { tweet: tweetId, likedBy: likedBy };
    const existingLike = await Like.findOne(likeCondition);

    let message;
    if (existingLike) {
        // If liked, unlike it
        await Like.findByIdAndDelete(existingLike._id);
        message = "Tweet unliked successfully";
    } else {
        // If not liked, like it
        await Like.create(likeCondition);
        message = "Tweet liked successfully";
    }

    return res
        .status(200)
        .json(new ApiResponse(
            200,
            { isLiked: !existingLike },
            message
        ));    
}
)

const getLikedVideos = asyncHandler(async (req, res) => {
    //TODO: get all liked videos

    const likedBy = req.user?._id; // Assuming req.user is populated by auth middleware
    const { page = 1, limit = 10 } = req.query; // For pagination

    if (!likedBy) {
        throw new ApiError(401, "Unauthorized: User not logged in");
    }

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);

    // Aggregate to get liked videos with their details

    const likedVideosAggregate = Like.aggregate([
        {
            $match: {
                likedBy: new mongoose.Types.ObjectId(likedBy),
                video: { $exsists: true } // Ensure it's a video like
            }
        },
        {
            $lookup: {
                from: "videos", // Collection name of the Video model (Mongoose pluralizes the model name)
                localField: "video",
                foreignField: "_id",
                as: "videoDetails"
            }
        },
        {
            $unwind: "$videoDetails" // Deconstruct the videoDetails array
        },
        {
            $lookup: {
                from: "users", // Collection the User model (Mongoose pluralizes the model name)
                localField: "videoDetails.owner",
                foreignField: "_id",
                as: "ownerDetails"
            }
        },
        {
            $unwind: "$ownerDetails" // Deconstruct the ownerDetails array
        },
        {
            $project: {
                _id: "$vidoeDetails._id",
                videoFile: "$vidoeDetails.videoFile",
                thumbnail: "$vidoeDetails.thumbnail",
                title: "$vidoeDetails.title",
                description: "$vidoeDetails.description",
                duration: "$vidoeDetails.duration",
                views: "$vidoeDetails.views",
                isPublished: "$vidoeDetails.isPublished",
                createdAt: "$vidoeDetails.createdAt",
                owner: {
                    _id: "$ownerDetails._id",
                    username: "$ownerDetails.username",
                    fullName: "$ownerDetails.fullName",
                    avatar: "$ownerDetails.avatar"
                }
            }
        },
        // Optional: Filter out unpublished videos if desired (add this after $project if needed)
        {
            $match: {
                isPublished: true // Only return published videos
            }
        }
    ]);

        // Use mongoose-aggregate-paginate-v2 if your Like model had it
    // If not, you can manually paginate:
    const options = {
        page: pageNumber,
        limit: limitNumber,
        sort: { createdAt: -1 } // Sort by most recently liked videos (or video creation date, as projected)
    };

    // If Video model has mongooseAggregatePaginate, you could use it like:
    // const likedVideos = await Video.aggregatePaginate(likedVideosAggregate, options);
    // But since we are starting the aggregation from Like model,
    // and assuming Like model does NOT have mongooseAggregatePaginate,
    // we'll manually apply skip and limit here if we want proper pagination:

    const likedVideos = await Like.aggregatePaginate(likedVideosAggregate, options);


    // If you don't have mongoose-aggregate-paginate-v2 on Like model,
    // you would fetch all and then slice, or build more complex aggregation for pagination:
    // const likedVideos = await likedVideosAggregate.skip((pageNumber - 1) * limitNumber).limit(limitNumber).exec();
    // const totalDocs = await Like.countDocuments({ likedBy: likedBy, video: { $exists: true } });
    // const totalPages = Math.ceil(totalDocs / limitNumber);


    return res
        .status(200)
        .json(new ApiResponse(
            200,
            likedVideos, // This will be the paginated result object
            "Liked videos fetched successfully"
        ));

})

export {
    toggleCommentLike,
    toggleTweetLike,
    toggleVideoLike,
    getLikedVideos
}