import mongoose, {isValidObjectId} from "mongoose"
import {User} from "../models/user.model.js"
import { Subscription } from "../models/subscription.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"


const toggleSubscription = asyncHandler(async (req, res) => {
    // TODO: toggle subscription
    const {channelId} = req.params;
    const subscriberId = req.user?._id; // The logged-in user is the subscriber

    // Validate subscriber and channel IDs
    if (!subscriberId) {
        throw new ApiError(401, "Unauthorized: User not logged in");
    }
    if (!isValidObjectId(channelId)) {
        throw new ApiError(400, "Invalid channel ID provided");
    }

    // Prevent a user from subscribing to themselves
    if (subscriberId.toString() === channelId.toString()) {
        throw new ApiError(400, "You cannot subscribe to your own channel");
    }

    // Check if the channel (User) exists
    const channel = await User.findById(channelId);
    if (!channel) {
        throw new ApiError(404, "Channel not found");
    }

    // Check if the subscription already exists
    const subscriptionCondition = {
        subscriber: subscriberId,
        channel: channelId
    };
    const existingSubscription = await Subscription.findOne(subscriptionCondition);

    let message;
    let newSubscriptionStatus;

    if (existingSubscription) {
        // If subscribed, unsubscribe
        await Subscription.findByIdAndDelete(existingSubscription._id);
        message = "Unsubscribed successfully";
        newSubscriptionStatus = false;
    } else {
        // If not subscribed, unsubscribe
        await Subscription.findByIdAndDelete(existingSubscription._id);
        message = "Subscribed successfully";
        newSubscriptionStatus = true;
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { subscribed: newSubscriptionStatus },
                message
        ));
});

// controller to return subscriber list of a channel
const getUserChannelSubscribers = asyncHandler(async (req, res) => {
    const {channelId} = req.params;
    const { page = 1, limit = 10 } = req.query; // For pagination

    // Validate channel ID
    if (!isValidObjectId(channelId)) {
        throw new ApiError(400, "Invalid channel ID provided");
    }

    // Check if the channel (User) exists
    const channel = await User.findById(channelId);
    if (!channel) {
        throw new ApiError(404, "Channel not found");
    }

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);

    const subscribersAggregate = Subscription.aggregate([
        {
            $match: {
                channel: mongoose.Types.ObjectId(channelId)
            }
        },
        {
            $lookup: {
                from: "users", // Collection name of the User model
                localField: "subscriber",
                foreignField: "_id",
                as: "subscriberInfo"
            }
        },
        {
            $unwind: "$subscriberInfo" // Deconstruct the subscriberInfo array
        },
        {
            $project: {
                _id: "$subscriberInfo._id",
                username: "$subscriberInfo.username",
                fullName: "$subscriberInfo.fullName",
                avatar: "$subscriberInfo.avatar",
                email: "$subscriberInfo.email",
                // You can include other relevant user fields here
                subscribedAt: "$createdAt" // Date of subscription
            }
        }
    ]);

    const subscriber = await Subscription.aggregatePaginate(subscribersAggregate, {
        page: pageNumber,
        limit: limitNumber,
        sort: { subscribedAt: -1 } // Sort by most recent subscribers first
    });

    return res
        .status(200)
        .json(
        new ApiResponse(
            200,
            subscriber,
            "Channel subscribers fetched successfully"
        )
    );

})

// controller to return channel list to which user has subscribed
const getSubscribedChannels = asyncHandler(async (req, res) => {
    const { subscriberId } = req.params;
    const { page = 1, limit = 10 } = req.query; // For pagination

    // Validate subscriber ID
    if (!isValidObjectId(subscriberId)) {
        throw new ApiError(400, "Invalid subscriber ID provided");
    }

    // Check if the subscriber (User) exists
    const subscriber = await User.findById(subscriberId);
    if (!subscriber) {
        throw new ApiError(404, "Subscriber not found");
    }

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);

    const subscribedChannelsAggregate = Subscription.aggregate([
        {
            $match: {
                subscriber: new mongoose.Types.ObjectId(subscriberId)
            }
        },
        {
            $lookup: {
                from: "users", // Collection name of the User model
                localField: "channel",
                foreignField: "_id",
                as: "channelInfo"
            }
        },
        {
            $unwind: "$channelInfo" // Deconstruct the channelInfo array
        },
        {
            $project: {
                _id: "$channelInfo._id",
                username: "$channelInfo.username",
                fullName: "$channelInfo.fullName",
                avatar: "$channelInfo.avatar",
                email: "$channelInfo.email",
                // You can include other relevant channel user fields here
                subscribedAt: "$createdAt" // Date of subscription
            }
        }
    ]);

    const subscribedChannels = await Subscription.aggregatePaginate(subscribedChannelsAggregate, {
        page: pageNumber,
        limit: limitNumber,
        sort: { subscribedAt: -1 } // Sort by most recent subscriptions first
    });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                subscribedChannels,
                "Subscribed channels fetched successfully"
            )
        );
})

export {
    toggleSubscription,
    getUserChannelSubscribers,
    getSubscribedChannels
}