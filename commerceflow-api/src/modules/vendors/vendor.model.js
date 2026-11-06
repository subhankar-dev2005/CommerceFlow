import mongoose from "mongoose";

export const VENDOR_STATUSES = Object.freeze([
  "pending",
  "active",
  "suspended"
]);

const vendorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Vendor name is required"],
      trim: true,
      minlength: [2, "Vendor name must contain at least 2 characters"],
      maxlength: [100, "Vendor name cannot exceed 100 characters"]
    },

    slug: {
      type: String,
      required: [true, "Vendor slug is required"],
      trim: true,
      lowercase: true,
      unique: true,
      index: true
    },

    status: {
      type: String,
      enum: {
        values: VENDOR_STATUSES,
        message: "Status must be either 'pending', 'active', or 'suspended'"
      },
      default: "pending",
      index: true
    },

    isFirstParty: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true
  }
);

const Vendor =
  mongoose.models.Vendor ||
  mongoose.model("Vendor", vendorSchema);

export default Vendor;
