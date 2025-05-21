import mongoose, { isValidObjectId } from "mongoose"
import {Video} from "../models/video.model.js"
import {Subscription} from "../models/subscription.model.js"
import {Like} from "../models/like.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import {User} from "../models/user.model.js"

const getChannelStats = asyncHandler(async (req, res) => {
    // TODO: Get the channel stats like total video views, total subscribers, total videos, total likes etc.

    const { channelId } = req.user?._id; // Assuming authenticated user is the channel owner

    if (!isValidObjectId(channelId)) {
        throw new ApiError(400, "Invalid channel ID provided")
    }

    // Verify if the user (channel) actually exists
    const channel = await User.findById(channelId);
    if (!channel) {
        throw new ApiError(404, "Channel not found");
    }

    // 1. Total Subscribers
    const totalSubscribers = await Subscription.countDocuments({ channel: channelId });

    // 2. Total Videos and Total Videos Views
    const videoStats = await Video.aggregate([
        {
            $match: { 
                owner: mongoose.Types.ObjectId(channelId),
                isPublished: true // only count published videos
             }
        },
        {
            $group: {
                _id: null, // Grouping all matching documents into a single group
                totalVideos: { $sum: 1 }, // Count of documents
                totalViews: { $sum: "$views" } // Sum of 'views' field
            }
        }
    ]);

    // Handle case where no videos are found
    const totalVideos = videoStats[0]?.totalVideos || 0;
    const totalVideoViews = videoStats[0]?.totalViews || 0;

    // 3. Total Likes on channel's videos
    // This requires two steps: get all video IDs owned by the channel, then count likes on those video IDs
    const channelVideoIds = await Video.find(
        { owner: channelId, isPublished: true },
        { _id: 1 } // Only fetch the _id field
    );
    const videoObjectIds = channelVideoIds.map(video => video._id);

    const totalLikes = await Like.countDocuments({ 
        video: { $in: videoObjectIds } // Count likes where video ID is in the list of channel's video IDs
    });

    const stats = {
        totalSubscribers,
        totalVideos,
        totalVideoViews,
        totalLikes
    };

    return res
        .status(200)
        .json(
        new ApiResponse(
            200, 
            stats,
            "Channel stats fetched successfully"
        )
    );
});

const getChannelVideos = asyncHandler(async (req, res) => {
    // TODO: Get all the videos uploaded by the channel

    const channelId = req.user?._id; // Assuming authenticated user is the channel owner
    const { page = 1, limit = 10, query, sortBy, sortType } = req.query; // Added query, sortBy, and sortType for flexibility

    if (!isValidObjectId(channelId)) {
        throw new ApiError(400, "Invalid channel ID provided");
    }

    // Verify if the user (channel) actually exists
    const channel = await User.findById(channelId);
    if (!channel) {
        throw new ApiError(404, "Channel not found");
    }

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);

    // Build the query object
    let matchQuery = { 
        owner: new mongoose.Types.ObjectId(channelId),
        isPublished: true // Only fetch published videos for the channel
    };
    if (query) {
        // Add text search if query is provided
        matchQuery.$or = [
            {
                title: {
                    $regex: query,
                    $options: "i" // Case-insensitive search
                }
            },
            {
                description: {
                    $regex: query,
                    $options: "i" // Case-insensitive search
                }
            }
        ];
    }

    // Build the sort options
    const sortOptions = {};
    if (sortBy && ['createdAt', 'views', 'duration', 'title'].includes(sortBy)) {
        sortOptions[sortBy] = sortType === 'desc' ? -1 : 1; // Default to ascending if not 'desc'
    } else {
        sortOptions.createdAt = -1; // Default sort by newest first
    }

    const aggregatePipeline = [
        {
            $match: matchQuery
        },
        {
            $sort: sortOptions
        },
        {
            $lookup: {
                from: "users",
                localfield: "owner",
                foreignField: "_id",
                as: "owner"
            }
        },
        {
            $unwind: "$owner"
        },
        {
            $project: {
                videoFile: 1,
                thumbnail: 1,
                title: 1,
                description: 1,
                duration: 1,
                views: 1,
                createdAt: 1,
                owner: {
                    username: 1,
                    fullName: 1,
                    avatar: 1,
                }
            }
        }
    ];

    const options = {
        page: pageNumber,
        limit: limitNumber,
        customLabels: {
            docs: "video", // Change 'docs' to 'videos' in the response
        }
    };

    // Use mongoose-aggregate-paginate-v2 plugin
    const channelVideos = await Video.aggregatePaginate(
        Video.aggregate(aggregatePipeline), // Pass the aggregate pipeline 
        options
    );

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                channelVideos,
                "Channel videos fetched successfully"
            )
        );
});

export {
    getChannelStats, 
    getChannelVideos
};