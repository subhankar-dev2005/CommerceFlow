
import mongoose from "mongoose";
import { CANCELLATION_ACTORS } from "./order-cancellation.constants.js";

const orderItemSchema = new mongoose.Schema(
  {
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

    variantName: {
      type: String,
      trim: true,
      default: null
    },

    sku: {
      type: String,
      trim: true,
      default: null
    },

    name: {
      type: String,
      required: true,
      trim: true
    },

    price: {
      type: Number,
      required: true,
      min: 0
    },

    quantity: {
      type: Number,
      required: true,
      min: 1
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0
    }
  },
  {
    _id: false
  }
);

const shippingAddressSchema = new mongoose.Schema(
  {
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
      maxlength: 100
    }
  },
  {
    _id: false
  }
);

const paymentSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ["stripe", "razorpay"],
      required: true
    },

    status: {
      type: String,
      enum: [
        "pending",
        "paid",
        "failed",
        "refunded"
      ],
      default: "pending"
    },

  transactionId: {
  type: String,
  trim: true,
  default: ""
},

    razorpayOrderId: {
      type: String,
      trim: true,
      default: ""
    },

    capturedAmount: {
      type: Number,
      min: 0,
      default: null
    },

    capturedAmountPaise: {
      type: Number,
      min: 0,
      default: null
    }
  },
  {
    _id: false
  }
);

const refundReservationSchema = new mongoose.Schema(
  {
    reservationId: {
      type: String,
      required: true,
      trim: true
    },
    returnId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Return",
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    amountInPaise: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ["active", "committed", "released"],
      default: "active"
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const refundSummarySchema = new mongoose.Schema(
  {
    totalRefunded: {
      type: Number,
      min: 0,
      default: 0
    },
    totalRefundedPaise: {
      type: Number,
      min: 0,
      default: 0
    },
    totalReserved: {
      type: Number,
      min: 0,
      default: 0
    },
    totalReservedPaise: {
      type: Number,
      min: 0,
      default: 0
    }
  },
  { _id: false }
);

const shipmentSchema = new mongoose.Schema(
  {
    carrier: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60
    },

    trackingNumber: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 100
    },

    trackingUrl: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ""
    },

    status: {
      type: String,
      enum: [
        "label_created",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "exception"
      ],
      default: "in_transit"
    },

    shippedAt: {
      type: Date,
      default: Date.now
    },

    estimatedDelivery: {
      type: Date,
      default: null
    },

    deliveredAt: {
      type: Date,
      default: null
    },

    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    _id: false
  }
);

const orderCouponSchema = new mongoose.Schema(
  {
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      default: null
    },

    code: {
      type: String,
      trim: true,
      default: null
    },

    type: {
      type: String,
      enum: ["percentage", "fixed"],
      default: null
    },

    value: {
      type: Number,
      default: null
    },

    discountAmount: {
      type: Number,
      min: 0,
      default: 0
    }
  },
  {
    _id: false
  }
);

const restoredItemSchema = new mongoose.Schema(
  {
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

    deducted: {
      type: Boolean,
      default: false
    },

    restorationState: {
      type: String,
      enum: ["pending", "restored"],
      default: "pending"
    },

    restored: {
      type: Boolean,
      default: false
    },

    restorationKey: {
      type: String,
      required: true
    }
  },
  {
    _id: false
  }
);

const checkoutCompensationSchema = new mongoose.Schema(
  {
    reservationId: {
      type: String,
      default: null
    },

    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      default: null
    },

    restoredItems: {
      type: [restoredItemSchema],
      default: []
    }
  },
  {
    _id: false
  }
);

const orderCancellationSchema = new mongoose.Schema(
  {
    reason: {
      type: String,
      required: true
    },
    reasonDetail: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ""
    },
    cancelledBy: {
      type: String,
      enum: CANCELLATION_ACTORS,
      required: true
    },
    cancelledAt: {
      type: Date,
      required: true,
      default: Date.now
    }
  },
  {
    _id: false
  }
);

const cancellationRestorationItemSchema = new mongoose.Schema(
  {
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
    lineIndex: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ["pending", "restored"],
      default: "pending",
      required: true
    },
    restoredAt: {
      type: Date,
      default: null
    }
  },
  {
    _id: false
  }
);

const cancellationRestorationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
      required: true
    },
    items: {
      type: [cancellationRestorationItemSchema],
      default: []
    },
    completedAt: {
      type: Date,
      default: null
    }
  },
  {
    _id: false
  }
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: function (items) {
          return items.length > 0;
        },
        message: "Order must contain at least one item"
      }
    },

    totalQuantity: {
      type: Number,
      required: true,
      min: 1
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0
    },

    shippingAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },

    taxAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },

    discountAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },

    total: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },

    coupon: {
      type: orderCouponSchema,
      default: null
    },

    payment: {
      type: paymentSchema,
      required: true
    },

    shippingAddress: {
      type: shippingAddressSchema,
      required: true
    },

    shipment: {
      type: shipmentSchema,
      default: null
    },

    status: {
      type: String,

      enum: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled"
      ],

      default: "pending"
    },

    cancellation: {
      type: orderCancellationSchema,
      default: null
    },

    cancellationRestoration: {
      type: cancellationRestorationSchema,
      default: null,
      select: false
    },

    checkoutState: {
      type: String,
      enum: ["none", "in_progress", "compensation_pending"],
      default: "none"
    },

    checkoutCompensation: {
      type: checkoutCompensationSchema,
      default: () => ({ reservationId: null, couponId: null, restoredItems: [] }),
      select: false
    },

    refundSummary: {
      type: refundSummarySchema,
      default: () => ({ totalRefunded: 0, totalRefundedPaise: 0, totalReserved: 0, totalReservedPaise: 0 })
    },

    refundReservations: {
      type: [refundReservationSchema],
      default: []
    }
  },
  {
    timestamps: true
  }
);

orderSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.checkoutCompensation;
    delete ret.cancellationRestoration;
    return ret;
  }
});

orderSchema.index({
  user: 1,
  createdAt: -1
});

orderSchema.index({
  user: 1,
  status: 1,
  createdAt: -1
});

orderSchema.index({
  "payment.razorpayOrderId": 1
});

orderSchema.index({
  "payment.transactionId": 1
});

orderSchema.index({
  status: 1,
  createdAt: -1
});

orderSchema.index({
  "payment.status": 1,
  createdAt: -1
});


const Order = mongoose.model(
  "Order",
  orderSchema
);

export default Order;
