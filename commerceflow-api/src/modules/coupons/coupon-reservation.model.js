import mongoose from "mongoose";

const couponReservationSchema = new mongoose.Schema(
  {
    coupon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      required: [true, "Coupon reference is required"]
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"]
    },

    slotNumber: {
      type: Number,
      required: [true, "Slot number is required"],
      min: [1, "Slot number must be at least 1"]
    },

    reservationId: {
      type: String,
      required: [true, "Reservation identifier is required"],
      trim: true
    },

    status: {
      type: String,
      enum: {
        values: ["reserved", "consumed"],
        message: "Status must be either 'reserved' or 'consumed'"
      },
      default: "reserved",
      required: true
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Guarantee atomic per-user limit enforcement across concurrent requests
couponReservationSchema.index(
  { coupon: 1, user: 1, slotNumber: 1 },
  { unique: true }
);

// Optimize lookup and cleanup by reservationId
couponReservationSchema.index({ reservationId: 1 }, { unique: true });

const CouponReservation = mongoose.model(
  "CouponReservation",
  couponReservationSchema
);

export default CouponReservation;
