import mongoose, {isValidObjectId} from "mongoose"
import {Video} from "../models/video.model.js"
import {User} from "../models/user.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"


const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query
    //TODO: get all videos based on query, sort, pagination
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);

    // Build the match query
    let matchQuery = { isPublished: true }; // Only show published videos by default

    if (userId) {
        if (!isValidObjectId(userId)) {
            throw new ApiError(400, "Invalid userId provided");
        }
        // Optionally, check if user exists
        const user = await User.findById(userId);
        if (!user) {
            throw new ApiError(404, "User (channel) not found");
        }
        matchQuery.owner = new mongoose.Types.ObjectId(userId);
    }

    if (query) {
        matchQuery.$or = [
            { title: { $regex: query, $options: 'i' } }, // Case-insensitive search
            { description: { $regex: query, $options: 'i' } }
        ];
    }

    // Build sort options
    const sortOptions = {};
    if (sortBy && ['createdAt', 'views', 'duration', 'title'].includes(sortBy)) {
        sortOptions[sortBy] = sortType === 'desc' ? -1 : 1;
    } else {
        sortOptions.createdAt = -1; // Default sort by newest videos first
    }

    const videosAggregate = Video.aggregate([
        {
            $match: matchQuery
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
                videoFile: 1,
                thumbnail: 1,
                title: 1,
                description: 1,
                duration: 1,
                views: 1,
                isPublished: 1,
                createdAt: 1,
                owner: {
                    _id: 1,
                    username: 1,
                    fullName: 1,
                    avatar: 1,
                }
            }
        },
        {
            $sort: sortOptions
        }
    ]);

    // Use mongoose-aggregate-paginate-v2 plugin
    const videos = await Video.aggregatePaginate(videosAggregate, {
        page: pageNumber,
        limit: limitNumber,
        customLabels: {
            docs: 'videos',
        }
    });

    return res
        .status(200)
        .json(new ApiResponse(
            200,
            videos,
            "Videos fetched successfully"
        ));
})

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description} = req.body
    // TODO: get video, upload to cloudinary, create video
    const ownerId = req.user?._id;

    if (!ownerId) {
        throw new ApiError(401, "Unauthorized: User not logged in");
    }

    if (!title?.trim() || !description?.trim()) {
        throw new ApiError(400, "Title and description are required");
    }

    // Check for videoFile and thumbnail existence from multer
    const videoFileLocalPath = req.files?.videoFile?.[0]?.path;
    const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path;

    if (!videoFileLocalPath) {
        throw new ApiError(400, "Video file is required");
    }
    if (!thumbnailLocalPath) {
        throw new ApiError(400, "Thumbnail is required");
    }

    // Upload to Cloudinary
    const videoFile = await uploadOnCloudinary(videoFileLocalPath);
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);

    if (!videoFile) {
        throw new ApiError(500, "Failed to upload video file to Cloudinary");
    }
    if (!thumbnail) {
        // If thumbnail upload fails, you might want to delete the already uploaded video file from Cloudinary
        await cloudinary.uploader.destroy(videoFile.public_id);
        throw new ApiError(500, "Failed to upload thumbnail to Cloudinary");
    }

    // Create video document in DB
    const video = await Video.create({
        videoFile: videoFile.url,
        thumbnail: thumbnail.url,
        title: title.trim(),
        description: description.trim(),
        duration: videoFile.duration, // Cloudinary provides duration for videos
        owner: ownerId,
        isPublished: true, // Default to published
    });

    if (!video) {
        // If DB creation fails, consider deleting uploaded files from Cloudinary
        await cloudinary.uploader.destroy(videoFile.public_id);
        await cloudinary.uploader.destroy(thumbnail.public_id);
        throw new ApiError(500, "Failed to publish video");
    }

    return res
        .status(201)
        .json(new ApiResponse(
            201,
            video,
            "Video published successfully"
        ));
})

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: get video by id
    const currentUserId = req.user?._id; // Get ID of the currently logged-in user

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID provided");
    }

    const video = await Video.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(videoId)
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner"
            }
        },
        {
            $unwind: "$owner"
        },
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "video",
                as: "likes"
            }
        },
        {
            $addFields: {
                likesCount: { $size: "$likes" },
                isLiked: {
                    $cond: {
                        if: currentUserId, // Check if user is logged in
                        then: { $in: [new mongoose.Types.ObjectId(currentUserId), "$likes.likedBy"] },
                        else: false
                    }
                },
            }
        },
        {
            $project: {
                videoFile: 1,
                thumbnail: 1,
                title: 1,
                description: 1,
                duration: 1,
                views: 1,
                isPublished: 1,
                createdAt: 1,
                updatedAt: 1,
                likesCount: 1,
                isLiked: 1,
                owner: {
                    _id: 1,
                    username: 1,
                    fullName: 1,
                    avatar: 1,
                    // Optionally, include subscriber details if needed
                }
            }
        }
    ]);

    if (!video || video.length === 0) {
        throw new ApiError(404, "Video not found");
    }

    // Increment views for the video (only if not the owner viewing their own video)
    const videoDocument = video[0]; // Get the video document from the aggregation result
    if (currentUserId && videoDocument.owner._id.toString() !== currentUserId.toString()) {
        await Video.findByIdAndUpdate(videoId, { $inc: { views: 1 } }, { new: true });
        videoDocument.views += 1; // Update views in the returned object for immediate reflection
    } else if (!currentUserId) { // If user is not logged in, increment views
        await Video.findByIdAndUpdate(videoId, { $inc: { views: 1 } }, { new: true });
        videoDocument.views += 1;
    }


    // Get subscription status if user is logged in and viewing another channel's video
    let isSubscribed = false;
    if (currentUserId && videoDocument.owner._id.toString() !== currentUserId.toString()) {
        const subscription = await mongoose.model('Subscription').findOne({
            subscriber: currentUserId,
            channel: videoDocument.owner._id
        });
        isSubscribed = !!subscription;
    }
    // Add isSubscribed to the response
    videoDocument.isSubscribed = isSubscribed;


    return res
        .status(200)
        .json(new ApiResponse(
            200,
            videoDocument,
            "Video fetched successfully"
        ));
})

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: update video details like title, description, thumbnail
    const { title, description } = req.body;
    const ownerId = req.user?._id;

    if (!ownerId) {
        throw new ApiError(401, "Unauthorized: User not logged in");
    }
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID provided");
    }

    // Check if at least title or description is provided
    if (!title?.trim() && !description?.trim() && !req.file?.path) {
        throw new ApiError(400, "Provide title, description, or thumbnail to update");
    }

    const video = await Video.findOne({
        _id: videoId,
        owner: ownerId
    });

    if (!video) {
        throw new ApiError(404, "Video not found or you are not the owner");
    }

    let updateFields = {};
    if (title?.trim()) {
        updateFields.title = title.trim();
    }
    if (description?.trim()) {
        updateFields.description = description.trim();
    }

    // Handle thumbnail update
    const newThumbnailLocalPath = req.file?.path; // Assuming 'thumbnail' is the field name for multer single upload
    let oldThumbnailPublicId;

    if (newThumbnailLocalPath) {
        const newThumbnail = await uploadOnCloudinary(newThumbnailLocalPath);
        if (!newThumbnail) {
            throw new ApiError(500, "Failed to upload new thumbnail");
        }
        updateFields.thumbnail = newThumbnail.url;

        // Get old thumbnail public ID for deletion
        if (video.thumbnail) {
            oldThumbnailPublicId = video.thumbnail.split('/').pop().split('.')[0];
        }
    }

    const updatedVideo = await Video.findByIdAndUpdate(
        videoId,
        {
            $set: updateFields
        },
        { new: true, runValidators: true }
    ).select("-__v"); // Exclude __v field

    if (!updatedVideo) {
        throw new ApiError(500, "Failed to update video"); // Should not happen if video was found
    }

    // Delete old thumbnail from Cloudinary if a new one was uploaded
    if (oldThumbnailPublicId) {
        try {
            await cloudinary.uploader.destroy(oldThumbnailPublicId);
            console.log("Old thumbnail deleted from Cloudinary:", oldThumbnailPublicId);
        } catch (error) {
            console.error("Error deleting old thumbnail from Cloudinary:", error);
            // Log but don't stop the request, as video update was successful
        }
    }


    return res
        .status(200)
        .json(new ApiResponse(
            200,
            updatedVideo,
            "Video details updated successfully"
        ));
})

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: delete video
    const ownerId = req.user?._id;

    if (!ownerId) {
        throw new ApiError(401, "Unauthorized: User not logged in");
    }
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID provided");
    }

    const video = await Video.findOneAndDelete({
        _id: videoId,
        owner: ownerId
    });

    if (!video) {
        throw new ApiError(404, "Video not found or you are not the owner");
    }

    // Delete video and thumbnail from Cloudinary
    const videoPublicId = video.videoFile.split('/').pop().split('.')[0];
    const thumbnailPublicId = video.thumbnail.split('/').pop().split('.')[0];

    try {
        await cloudinary.uploader.destroy(videoPublicId, { resource_type: "video" });
        await cloudinary.uploader.destroy(thumbnailPublicId);
        console.log("Video and thumbnail deleted from Cloudinary:", videoPublicId, thumbnailPublicId);
    } catch (error) {
        console.error("Error deleting files from Cloudinary:", error);
        // Log but continue, as the DB entry is removed
    }

    // Delete associated likes, comments, and remove from playlists
    await Like.deleteMany({ video: videoId });
    await Comment.deleteMany({ video: videoId });
    await Playlist.updateMany(
        { videos: videoId },
        { $pull: { videos: videoId } }
    );

    return res
        .status(200)
        .json(new ApiResponse(
            200,
            {},
            "Video deleted successfully"
        ));
})

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const ownerId = req.user?._id;

    if (!ownerId) {
        throw new ApiError(401, "Unauthorized: User not logged in");
    }
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID provided");
    }

    const video = await Video.findOne({
        _id: videoId,
        owner: ownerId
    });

    if (!video) {
        throw new ApiError(404, "Video not found or you are not the owner");
    }

    video.isPublished = !video.isPublished; // Toggle the status
    await video.save({ validateBeforeSave: false }); // Save the change

    return res
        .status(200)
        .json(new ApiResponse(
            200,
            { isPublished: video.isPublished },
            "Video publish status toggled successfully"
        ));
})

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}