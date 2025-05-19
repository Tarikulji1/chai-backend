import mongoose, { Schema } from "mongoose";

const subscriptionSchema = new Schema({
    subscriber: {
        type: Schema.Types.ObjectId, // one who is subscribing
        ref: "User",
    },
    channel: {
        type: Schema.Types.ObjectId, // one whom they are subscribing to
        ref: "User",
    }
}, { timestamps: true });

export const Subscription = mongoose.model("Subscription", subscriptionSchema);