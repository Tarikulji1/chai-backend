import mongoose, { isValidObjectId } from "mongoose"
import {Tweet} from "../models/tweet.model.js"
import {User} from "../models/user.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

const createTweet = asyncHandler(async (req, res) => {
    //TODO: create tweet
    const { content } = req.body;
    const ownerId = req.user?._id; // The logged-in user is the owner of the tweet

    // Validate owner
    if (!ownerId) {
        throw new ApiError(401, "Unauthorized: User not logged in");
    }

    // Validate content
    if (!content?.trim()) {
        throw new ApiError(400, "Tweet content is required");
    }

    // Create the tweet
    const tweet = await Tweet.create({
        content: content.trim(),
        owner: ownerId,
    });

    if (!tweet) {
        throw new ApiError(500, "Failed to create tweet");
    }

    // Optionally, populate owner details before sending response
    const createdTweet = await Tweet.findById(tweet._id).populate(
        "owner",
        "username fullName avatar" // Select desired user fields
    );

    return res
        .status(201)
        .json(
            new ApiResponse(201, createdTweet, "Tweet created successfully")
        );
});

const getUserTweets = asyncHandler(async (req, res) => {
    // TODO: get user tweets
    const { userId } = req.params;
    const { page = 1, limit = 10, sortBy, sortType } = req.query; // For pagination and sorting

    // Validate userId
    if (!isValidObjectId(userId)) {
        throw new ApiError(400, "Invalid user ID provided");
    }

    // Check if the user exists
    const user = await User.findById(userId);
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);

    // Build sort options
    const sortOptions = {};
    if (sortBy && ['createdAt', 'updatedAt'].includes(sortBy)) {
        sortOptions[sortBy] = sortType === 'desc' ? -1 : 1;
    } else {
        sortOptions.createdAt = -1; // Default sort by newest first
    }

    const tweetsAggregate = Tweet.aggregate([
        {
            $match: {
                owner: new mongoose.Types.ObjectId(userId)
            }
        },
        {
            $lookup: {
                from: "users", // Collection name of the User model
                localField: "owner",
                foreignField: "_id",
                as: "owner"
            }
        },
        {
            $unwind: "$owner" // Deconstruct the owner array
        },
        {
            $project: {
                content: 1,
                createdAt: 1,
                updatedAt: 1,
                owner: {
                    username: 1,
                    fullName: 1,
                    avatar: 1,
                }
            }
        },
        {
            $sort: sortOptions // Apply sorting
        }
    ]);

    const tweets = await Tweet.aggregatePaginate(tweetsAggregate, {
        page: pageNumber,
        limit: limitNumber,
    });

    return res
        .status(200)
        .json(
            new ApiResponse(200, tweets, "User tweets fetched successfully")
        );
})

const updateTweet = asyncHandler(async (req, res) => {
    //TODO: update tweet
    const { tweetId } = req.params;
    const { content } = req.body;
    const ownerId = req.user?._id;

    // Validate owner
    if (!ownerId) {
        throw new ApiError(401, "Unauthorized: User not logged in");
    }
    // Validate tweetId
    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweet ID provided");
    }
    // Validate content
    if (!content?.trim()) {
        throw new ApiError(400, "Tweet content cannot be empty");
    }

    // Find and update the tweet, ensuring ownership
    const updatedTweet = await Tweet.findOneAndUpdate(
        {
            _id: tweetId,
            owner: ownerId, // Only the owner can update their tweet
        },
        {
            $set: {
                content: content.trim(),
            },
        },
        {
            new: true, // Return the updated document
            runValidators: true, // Run schema validators
        }
    ).populate("owner", "username fullName avatar"); // Populate owner after update

    if (!updatedTweet) {
        // If tweet not found or owner doesn't match
        throw new ApiError(404, "Tweet not found or you are not the owner");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, updatedTweet, "Tweet updated successfully")
        );
})

const deleteTweet = asyncHandler(async (req, res) => {
    //TODO: delete tweet
    const { tweetId } = req.params;
    const ownerId = req.user?._id;

    // Validate owner
    if (!ownerId) {
        throw new ApiError(401, "Unauthorized: User not logged in");
    }
    // Validate tweetId
    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweet ID provided");
    }

    // Find and delete the tweet, ensuring ownership
    const deletedTweet = await Tweet.findOneAndDelete({
        _id: tweetId,
        owner: ownerId, // Only the owner can delete their tweet
    });

    if (!deletedTweet) {
        // If tweet not found or owner doesn't match
        throw new ApiError(404, "Tweet not found or you are not the owner");
    }

    // Optional: Delete associated likes/comments for this tweet if any (if you implement cascading deletes)
    // await Like.deleteMany({ tweet: tweetId });
    // await Comment.deleteMany({ tweet: tweetId }); // If comments can be on tweets

    return res
        .status(200)
        .json(
            new ApiResponse(200, {}, "Tweet deleted successfully")
        );
})

export {
    createTweet,
    getUserTweets,
    updateTweet,
    deleteTweet
}