import mongoose from "mongoose";

const inventoryAdjustmentSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true
    },
    productName: {
      type: String,
      required: true,
      trim: true
    },
    variantId: {
      type: String,
      default: null,
      trim: true
    },
    variantName: {
      type: String,
      default: null,
      trim: true
    },
    sku: {
      type: String,
      trim: true,
      default: null
    },
    previousStock: {
      type: Number,
      required: true
    },
    adjustment: {
      type: Number,
      required: true
    },
    resultingStock: {
      type: Number,
      required: true
    },
    reason: {
      type: String,
      required: true,
      enum: [
        "stock_correction",
        "damaged_inventory",
        "returned_inventory",
        "manual_count",
        "receiving",
        "other"
      ]
    },
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ""
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    adminEmail: {
      type: String,
      trim: true,
      required: true
    }
  },
  {
    timestamps: true
  }
);

inventoryAdjustmentSchema.index({ product: 1, createdAt: -1 });
inventoryAdjustmentSchema.index({ createdAt: -1 });

const InventoryAdjustment = mongoose.model(
  "InventoryAdjustment",
  inventoryAdjustmentSchema
);

export default InventoryAdjustment;
