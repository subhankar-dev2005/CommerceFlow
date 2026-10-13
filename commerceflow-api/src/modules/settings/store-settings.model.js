import mongoose from "mongoose";

export const STORE_SETTINGS_SINGLETON_KEY = "default_store_settings";

const storeSettingsSchema = new mongoose.Schema(
  {
    singletonKey: {
      type: String,
      required: true,
      unique: true,
      default: STORE_SETTINGS_SINGLETON_KEY
    },
    storeName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
      default: "CommerceFlow"
    },

    supportEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      default: "support@commerceflow.com"
    },

    supportPhone: {
      type: String,
      trim: true,
      default: "+91 98765 43210"
    },

    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      default: "INR"
    },

    currencySymbol: {
      type: String,
      required: true,
      trim: true,
      default: "₹"
    },

    freeShippingThreshold: {
      type: Number,
      required: true,
      min: 0,
      default: 999
    },

    standardShippingRate: {
      type: Number,
      required: true,
      min: 0,
      default: 99
    },

    lowStockThreshold: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
      default: 5
    },

    returnWindowDays: {
      type: Number,
      required: true,
      min: 1,
      max: 90,
      default: 14
    },

    isMaintenanceMode: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

const StoreSettings = mongoose.model("StoreSettings", storeSettingsSchema);

export default StoreSettings;
