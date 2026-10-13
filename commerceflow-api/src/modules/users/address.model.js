
import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100
    },

    phone: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 20
    },

    addressLine1: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },

    addressLine2: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ""
    },

    city: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },

    state: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },

    postalCode: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20
    },

    country: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      default: "India"
    },

    isDefault: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

const Address = mongoose.model(
  "Address",
  addressSchema
);

export default Address;

