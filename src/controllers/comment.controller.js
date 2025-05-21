import mongoose, { isValidObjectId } from "mongoose"
import {Comment} from "../models/comment.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import {Video} from "../models/video.model.js"

const getVideoComments = asyncHandler(async (req, res) => {
    // TODO: get all comments for a video
    const { videoId } = req.params;

    // Validate videoId
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID provided")
    }

    // Ensure video exists (optional but good practice to prevent comments on non-existent videos)
    // Method 2: Using Mongoose
    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(404, "Video not found")
    }
    /*
    Method 1: Using Mongoose
    const video = await mongoose.model("Video").findById(videoId)
    if (!video) {
        throw new ApiError(404, "Video not found")
    }
     */

    const { page = 1, limit = 10 } = req.query

    // convert page and limit to numbers
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);

    // Mongoose Aggregate Paginate options
    const options = {
        page: pageNumber,
        limit: limitNumber,
        sort: { createdAt: -1 }, // Sort by newest comments first // Sort by createdAt in descending order
    }

    const commentsAggregate = Comment.aggregate([
        {
            $match: {
                video: mongoose.Types.ObjectId(videoId)
            }
        },
        {
            $lookup: {
                from: "users", // The collection name in MongoDB
                localField: "owner",
                foreignField: "_id",
                as: "owner"
            }
        },
        {
            $unwind: "$owner" // Deconstruct the owner array (since it's a single owner)
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
        }

    ]);

    const result = await Comment.aggregatePaginate(commentsAggregate, options);

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                "Video comments fetched successfully",
                {
                    comments: result.docs,
                    totalPages: result.totalPages,
                    currentPage: result.page,
                    totalComments: result.totalDocs
                }
            )
        );

});

const addComment = asyncHandler(async (req, res) => {
    // TODO: add a comment to a video
    
    const { videoId } = req.params;
    const { content } = req.body;
    const ownerId = req.user?._id; // Assuming req.user is populated by auth middleware

    // Validate inputs
    if (!ownerId) {
        throw new ApiError(401, "Unauthorized: User not logged in")
    }
    if (!content?.trim()) {
        throw new ApiError(400, "Comment content is required")
    }
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID provided")
    }

    // Ensure video exists
    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    const comment = new Comment.create({
        content,
        video: videoId,
        owner: ownerId
    });

    if (!comment) {
        throw new ApiError(500, "Failed to add comment")
    }

    // Optionally, populate owner and video details before sending the response
    const createdComment = await Comment.findById(comment._id)
        .populate("owner", "username fullName avatar")
        .populate("video", "title thumbnail");

    return res
        .status(201)
        .json(
            new ApiResponse(
                201,
                createdComment,
                "Comment added successfully",
            )
        );

})

const updateComment = asyncHandler(async (req, res) => {
    // TODO: update a comment
    const { commentId } = req.params;
    const { content } = req.body;
    const ownerId = req.user?._id; // Assuming req.user is populated by auth middleware

    // Validate inputs
    if (!ownerId) {
        throw new ApiError(401, "Unauthorized: User not logged in")
    }
    if (!isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid comment ID provided")
    }
    if (!content?.trim()) {
        throw new ApiError(400, "Comment content cannot be empty")
    }

    const comment = await Comment.findOneAndUpdate(
        {
            _id: commentId,
            owner: ownerId // Ensure the comment belongs to the user
        },
        {
            $set: {
                content: content.trim() // Update the content
            }
        },
        {
            new: true, // Return the updated document
            runValidators: true // Ensure validators are run on the update
        }
    );

    if (!comment) {
        throw new ApiError(404, "Comment not found or you do not have permission to update it")
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                comment,
                "Comment updated successfully",
            )
        );

})

const deleteComment = asyncHandler(async (req, res) => {
    // TODO: delete a comment
    const { commentId } = req.params;
    const ownerId = req.user?._id; // Assuming req.user is populated by auth middleware

    // Validate inputs
    if (!ownerId) {
        throw new ApiError(401, "Unauthorized: User not logged in")
    }
    if (!isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid comment ID provided")
    }

    const comment = await Comment.findOneAndDelete(
        {
            _id: commentId,
            owner: ownerId // Ensure only the owner can delete their comment
        }
    );

    if (!comment) {
        throw new ApiError(404, "Comment not found or you are not owner")
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {}, // No need to return the deleted comment
                "Comment deleted successfully",
            )
        );
})

export {
    getVideoComments, 
    addComment, 
    updateComment,
    deleteComment
};