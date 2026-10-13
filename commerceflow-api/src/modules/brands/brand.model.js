import mongoose from "mongoose";

const brandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Brand name is required"],
      trim: true,
      minlength: [2, "Brand name must contain at least 2 characters"],
      maxlength: [100, "Brand name cannot exceed 100 characters"]
    },

    slug: {
      type: String,
      required: [true, "Brand slug is required"],
      trim: true,
      lowercase: true,
      unique: true,
      index: true
    },

    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
      default: ""
    },

    website: {
      type: String,
      trim: true,
      default: null
    },

    logo: {
      type: String,
      trim: true,
      default: null
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

brandSchema.index({
  name: "text",
  description: "text"
});

const Brand = mongoose.model("Brand", brandSchema);

export default Brand;
