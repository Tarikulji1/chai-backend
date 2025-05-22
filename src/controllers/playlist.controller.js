import mongoose, {isValidObjectId} from "mongoose"
import {Playlist} from "../models/playlist.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import {User} from "../models/user.model.js"
import {Video} from "../models/video.model.js"


const createPlaylist = asyncHandler(async (req, res) => {
    //TODO: create playlist
    
    const {name, description} = req.body; 
    const owner = req.user._id; // Get owner from authenticated user

    // Validate owner
    if (!owner) {
        throw new ApiError(401, "Unauthorized: User not logged in");
    }

    // Validate name and description
    if (!name?.trim() || !description?.trim()) {
        throw new ApiError(400, "Playlist name and description are required");
    }

    // Create playlist
    const playlist = await Playlist.create({
        name: name.trim(),
        description: description.trim(),
        owner
    });

    if (!playlist) {
        throw new ApiError(500, "Failed to create playlist");
    }

    return res
        .status(201)
        .json(
            new ApiResponse(201, playlist, "Playlist created successfully")
        );
})

const getUserPlaylists = asyncHandler(async (req, res) => {
    //TODO: get user playlists
    const {userId} = req.params;

        // Validate userId
    if (!isValidObjectId(userId)) {
        throw new ApiError(400, "Invalid user ID provided");
    }

    // Check if the user exists
    const user = await User.findById(userId);
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    // Get user playlists using aggregation to populate videos and their owners
    const userPlaylists = await Playlist.aggregate([
        {
            $match: {
                owner: new mongoose.Types.ObjectId(userId)
            }
        },
        {
            $lookup: {
                from: "videos", // Collection name for Video model
                localField: "videos",
                foreignField: "_id",
                as: "videos"
            }
        },
        {
            $lookup: {
                from: "users", // Collection name for User model
                localField: "owner",
                foreignField: "_id",
                as: "owner"
            }
        },
        {
            $unwind: "$owner" // Deconstruct owner array as it's a single owner
        },
        {
            $project: {
                name: 1,
                description: 1,
                createdAt: 1,
                updatedAt: 1,
                videos: {
                    _id: 1,
                    title: 1,
                    thumbnail: 1,
                    duration: 1,
                    views: 1,
                    videoFile: 1,
                    isPublished: 1,
                },
                owner: {
                    _id: 1,
                    username: 1,
                    fullName: 1,
                    avatar: 1,
                }
            }
        },
        {
            $sort: { createdAt: -1 } // Sort by newest playlist first
        },
        {
            $limit: 10 // Limit to 10 playlists
        },
    ]);

    return res
        .status(200)
        .json(
            new ApiResponse(200, userPlaylists, "User playlists fetched successfully")
        );
})

const getPlaylistById = asyncHandler(async (req, res) => {
    //TODO: get playlist by id
    const {playlistId} = req.params;
     
    // Validate playlistId
    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid playlist ID provided");
    }

    // Get playlist by ID using aggregation for detailed view
    const playlist = await Playlist.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(playlistId)
            }
        },
        {
            $lookup: {
                from: "videos", // Collection name for Video model
                localField: "videos",
                foreignField: "_id",
                as: "videos"
            }
        },
        // Optionally, lookup the owner of each video if needed, and filter out unpublished videos
        {
            $addFields: {
                videos: {
                    $filter: {
                        input: "$videos",
                        as: "video",
                        cond: {
                            $eq: ["$$video.isPublished", true] // Filter only published videos
                        }
                    }
                }
            }
        },
        {
            $lookup: {
                from: "users", // Collection name for User model
                localField: "owner",
                foreignField: "_id",
                as: "owner"
            }
        },
        {
            $unwind: "$owner" // Deconstruct owner array as it's a single owner
        },
        {
            $project: {
                name: 1,
                description: 1,
                createdAt: 1,
                updatedAt: 1,
                totalVideos: { $size: "$videos" }, // Count videos in playlist
                totalViews: { $sum: "$videos.views" }, // Sum views of all videos in playlist
                videos: {
                    _id: 1,
                    videoFile: 1,
                    thumbnail: 1,
                    title: 1,
                    description: 1,
                    duration: 1,
                    views: 1,
                    isPublished: 1,
                },
                owner: {
                    _id: 1,
                    username: 1,
                    fullName: 1,
                    avatar: 1,
                }
            }
        }
    ]);
    if (!playlist || playlist.length === 0) {
        throw new ApiError(404, "Playlist not found");
    }
    return res
        .status(200)
        .json(
            new ApiResponse(200, playlist[0], "Playlist fetched successfully")
        );
})

const addVideoToPlaylist = asyncHandler(async (req, res) => {
    const { playlistId, videoId } = req.params;
    const ownerId = req.user?._id;

    // Validate IDs
    if (!ownerId) {
        throw new ApiError(401, "Unauthorized: User not logged in");
    }
    if (!isValidObjectId(playlistId) || !isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid playlist ID or video ID provided");
    }

    // Check if video exists
    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    // Find playlist and check ownership
    const playlist = await Playlist.findOne({
        _id: playlistId,
        owner: ownerId,
    });

    if (!playlist) {
        throw new ApiError(404, "Playlist not found or you are not the owner");
    }

    // Check if video is already in the playlist to prevent duplicates
    if (playlist.videos.includes(videoId)) {
        throw new ApiError(409, "Video already exists in the playlist");
    }

    // Add video to playlist
    playlist.videos.push(videoId); // Or use $addToSet in update for atomic operation
    await playlist.save({ validateBeforeSave: false }); // Bypass full schema validation if only modifying array

    // Alternatively, use findByIdAndUpdate with $addToSet (more atomic)
    // const updatedPlaylist = await Playlist.findOneAndUpdate(
    //     { _id: playlistId, owner: ownerId },
    //     { $addToSet: { videos: videoId } }, // $addToSet ensures no duplicates
    //     { new: true }
    // );
    // if (!updatedPlaylist) { throw new ApiError(404, "Playlist not found or you are not the owner"); }


    return res
        .status(200)
        .json(
            new ApiResponse(200, playlist, "Video added to playlist successfully")
        );

})

const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
    // TODO: remove video from playlist
    const {playlistId, videoId} = req.params;
    const ownerId = req.user?._id;

    // Validate IDs
    if (!ownerId) {
        throw new ApiError(401, "Unauthorized: User not logged in");
    }
    if (!isValidObjectId(playlistId) || !isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid playlist ID or video ID provided");
    }

    // Find playlist and check ownership
    const playlist = await Playlist.findOne({
        _id: playlistId,
        owner: ownerId,
    });

    if (!playlist) {
        throw new ApiError(404, "Playlist not found or you are not the owner");
    }

    // Check if video exists in the playlist
    if (!playlist.videos.includes(videoId)) {
        throw new ApiError(404, "Video not found in the playlist");
    }

    // Remove video from playlist
    const updatedPlaylist = await Playlist.findOneAndUpdate(
        { _id: playlistId, owner: ownerId },
        { $pull: { videos: videoId } }, // $pull removes specified element from array
        { new: true }
    );

    if (!updatedPlaylist) { // This check is mostly for safety; should be found if previous find worked
        throw new ApiError(500, "Failed to remove video from playlist");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, updatedPlaylist, "Video removed from playlist successfully")
        );
})

const deletePlaylist = asyncHandler(async (req, res) => {
    // TODO: delete playlist
    const {playlistId} = req.params;
    const ownerId = req.user?._id;

    // Validate ID
    if (!ownerId) {
        throw new ApiError(401, "Unauthorized: User not logged in");
    }
    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid playlist ID provided");
    }

    // Find and delete playlist, ensuring ownership
    const playlist = await Playlist.findOneAndDelete({
        _id: playlistId,
        owner: ownerId,
    });

    if (!playlist) {
        throw new ApiError(404, "Playlist not found or you are not the owner");
    }

    // Optional: If you had logic for deleting associated files (e.g., a playlist thumbnail), do it here.

    return res
        .status(200)
        .json(
            new ApiResponse(200, {}, "Playlist deleted successfully")
        );
})

const updatePlaylist = asyncHandler(async (req, res) => {
    //TODO: update playlist
    const {playlistId} = req.params;
    const {name, description} = req.body;
    const ownerId = req.user?._id;

    // Validate Input
    if (!ownerId) {
        throw new ApiError(401, "Unauthorized: User not logged in");
    }
    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid playlist ID provided");
    }

    // Validate at least one field is provided for update
    if (!name?.trim() && !description?.trim()) {
        throw new ApiError(400, "Name or description is required for update");
    }

    // Build update object
    const updateFields = {};
    if (name?.trim()) {
        updateFields.name = name.trim();
    }
    if (description?.trim()) {
        updateFields.description = description.trim();
    }

    // Find and update playlist, ensuring ownership
    const updatedPlaylist = await Playlist.findOneAndUpdate(
        {
            _id: playlistId,
            owner: ownerId,
        },
        {
            $set: updateFields,
        },
        {
            new: true, // Return the updated document
            runValidators: true, // Run schema validators on update
        }
    ).select("-__v"); // Exclude mongoose internal version key

    if (!updatedPlaylist) {
        throw new ApiError(404, "Playlist not found or you are not the owner");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, updatedPlaylist, "Playlist updated successfully")
        );
})

export {
    createPlaylist,
    getUserPlaylists,
    getPlaylistById,
    addVideoToPlaylist,
    removeVideoFromPlaylist,
    deletePlaylist,
    updatePlaylist
}