import mongoose from "mongoose";

const checkoutInventoryRestorationSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true
    },

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },

    variantId: {
      type: String,
      trim: true,
      default: null
    },

    quantity: {
      type: Number,
      required: true,
      min: 1
    },

    restorationKey: {
      type: String,
      required: true,
      trim: true
    },

    status: {
      type: String,
      enum: ["pending", "restored"],
      default: "pending",
      required: true
    }
  },
  {
    timestamps: true
  }
);

checkoutInventoryRestorationSchema.index({ restorationKey: 1 }, { unique: true });

const CheckoutInventoryRestoration = mongoose.model(
  "CheckoutInventoryRestoration",
  checkoutInventoryRestorationSchema
);

export default CheckoutInventoryRestoration;
