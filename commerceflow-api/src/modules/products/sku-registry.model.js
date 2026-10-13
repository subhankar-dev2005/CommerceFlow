import mongoose from "mongoose";

const skuRegistrySchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: [true, "SKU is required"],
      trim: true,
      uppercase: true,
      match: [
        /^[A-Z0-9_-]+$/,
        "SKU can only contain alphanumeric characters, hyphens, and underscores"
      ]
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product reference is required"]
    },
    variantId: {
      type: String,
      trim: true,
      default: null
    }
  },
  {
    timestamps: true
  }
);

skuRegistrySchema.index({ sku: 1 }, { unique: true });

const SkuRegistry =
  mongoose.models.SkuRegistry ||
  mongoose.model("SkuRegistry", skuRegistrySchema);

export default SkuRegistry;
