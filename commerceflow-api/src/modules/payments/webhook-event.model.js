import mongoose from "mongoose";

const webhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },
    provider: {
      type: String,
      required: true,
      enum: ["razorpay"]
    },
    event: {
      type: String,
      required: true,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

const WebhookEvent = mongoose.model(
  "WebhookEvent",
  webhookEventSchema
);

export default WebhookEvent;