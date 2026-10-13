
import mongoose from "mongoose";

const specificationSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60
    },
    value: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300
    }
  },
  { _id: false }
);

/**
 * Variant subdocument schema for hybrid embedded architecture.
 *
 * NOTE ON SKU UNIQUENESS LIMITATION:
 * Catalog-wide SKU uniqueness cannot be safely enforced at the MongoDB schema/index layer
 * because "variants.sku" across embedded arrays forms a multikey index.
 * A unique multikey index on an array of embedded documents ({ "variants.sku": 1 }) has critical limitations:
 * 1) In MongoDB, sparse unique multikey indexes still index documents where fields are null or missing
 *    if other fields in the parent document exist, causing duplicate key errors across products
 *    with variants having null SKUs or multiple variants lacking SKUs within a single product.
 * 2) Compound unique indexes across embedded array documents have multikey constraints.
 * Therefore, catalog-wide unique SKU validation is deferred to the application/service layer (P1.6.3+),
 * and the database does NOT guarantee catalog-wide SKU uniqueness without a dedicated collection architecture.
 */
const variantSchema = new mongoose.Schema(
  {
    variantId: {
      type: String,
      required: [true, "Variant ID is required"],
      trim: true,
      minlength: [1, "Variant ID cannot be empty"],
      maxlength: [64, "Variant ID cannot exceed 64 characters"]
    },

    sku: {
      type: String,
      required: [true, "Variant SKU is required"],
      trim: true,
      uppercase: true,
      minlength: [1, "Variant SKU cannot be empty"],
      maxlength: [100, "Variant SKU cannot exceed 100 characters"]
    },

    attributes: {
      type: Map,
      of: String,
      default: () => new Map()
    },

    price: {
      type: Number,
      min: [0, "Variant price cannot be negative"],
      default: null
    },

    stock: {
      type: Number,
      required: [true, "Variant stock is required"],
      min: [0, "Variant stock cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Variant stock must be an integer"
      }
    },

    images: {
      type: [
        {
          type: String,
          trim: true,
          validate: {
            validator: function (v) {
              if (!v) return true;
              try {
                const url = new URL(v);
                return url.protocol === "http:" || url.protocol === "https:";
              } catch {
                return false;
              }
            },
            message: "Each variant image must be a valid URL"
          }
        }
      ],
      default: []
    },

    isActive: {
      type: Boolean,
      default: true
    }
  },
  { _id: false, strict: "throw" }
);

variantSchema.pre("validate", function () {
  if (this.attributes && typeof this.attributes.entries === "function") {
    const normalized = new Map();
    for (const [key, val] of this.attributes.entries()) {
      if (typeof key === "string" && typeof val === "string") {
        normalized.set(key.trim().toLowerCase(), val.trim().replace(/\s+/g, " "));
      } else if (typeof key === "string") {
        normalized.set(key.trim().toLowerCase(), val);
      }
    }
    this.attributes = normalized;
  }
});

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 200
    },

    description: {
      type: String,
      required: true,
      trim: true
    },

    price: {
      type: Number,
      required: true,
      min: 0
    },

    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },

    category: {
      type: String,
      required: true,
      trim: true
    },

    image: {
      type: String,
      default: null
    },

    images: {
      type: [
        {
          type: String,
          trim: true
        }
      ],
      default: []
    },

    specifications: {
      type: [specificationSchema],
      default: []
    },

    isActive: {
      type: Boolean,
      default: true
    },

    ratingAverage: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },

    ratingCount: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "Rating count must be an integer"
      }
    },

    restorationKeys: {
      type: [String],
      default: []
    },

    variants: {
      type: [variantSchema],
      default: []
    }
  },
  {
    timestamps: true
  }
);

productSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.restorationKeys;
    return ret;
  }
});

productSchema.index({
  name: "text",
  description: "text"
});

productSchema.index({
  isActive: 1,
  createdAt: -1
});

productSchema.index({
  category: 1,
  isActive: 1,
  createdAt: -1
});

productSchema.index({
  isActive: 1,
  price: 1
});

productSchema.index({
  "variants.variantId": 1
});

const Product = mongoose.model(
  "Product",
  productSchema
);

export default Product;
