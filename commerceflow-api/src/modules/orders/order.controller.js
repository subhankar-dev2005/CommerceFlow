import crypto from "node:crypto";
import Cart from "../cart/cart.model.js";
import Product from "../products/product.model.js";
import Address from "../users/address.model.js";
import Order from "./order.model.js";
import Coupon from "../coupons/coupon.model.js";
import CouponUsage from "../coupons/coupon-usage.model.js";
import CouponReservation from "../coupons/coupon-reservation.model.js";
import { normalizeCouponCode } from "../coupons/coupon.validator.js";
import { evaluateCouponEligibility } from "../coupons/coupon.service.js";
import compensateOrderRedemption from "./compensate-order-redemption.js";

import AppError from "../../common/errors/app-error.js";
import { calculateOrderFinancials } from "../../utils/pricing.js";

/**
 * Resolves the display/snapshot variant name from an authoritative variant subdocument.
 *
 * @param {object} variant - The variant subdocument
 * @returns {string|null}
 */
function resolveVariantName(variant) {
  if (!variant || typeof variant !== "object") return null;

  if (typeof variant.variantName === "string" && variant.variantName.trim()) {
    return variant.variantName.trim();
  }

  if (typeof variant.name === "string" && variant.name.trim()) {
    return variant.name.trim();
  }

  if (variant.attributes) {
    let entries = [];
    if (variant.attributes instanceof Map) {
      entries = Array.from(variant.attributes.entries());
    } else if (typeof variant.attributes === "object") {
      entries = Object.entries(variant.attributes);
    }
    if (entries.length > 0) {
      const formatted = entries
        .map(([_, val]) => (val !== null && val !== undefined ? String(val).trim() : ""))
        .filter(Boolean)
        .join(" / ");
      if (formatted) return formatted;
    }
  }

  return null;
}

async function createOrder(req, res, next) {
  try {
    const { addressId, couponCode } = req.body;

    const address = await Address.findOne({
      _id: addressId,
      user: req.user._id
    });

    if (!address) {
      throw new AppError(
        "Shipping address not found",
        404,
        [],
        "ADDRESS_NOT_FOUND"
      );
    }

    const cart = await Cart.findOne({
      user: req.user._id
    }).populate("items.product");

    if (!cart || cart.items.length === 0) {
      throw new AppError(
        "Cart is empty",
        400,
        [],
        "CART_EMPTY"
      );
    }

    const orderItems = [];
    const eligibleCartItems = [];

    let totalQuantity = 0;
    let subtotal = 0;

    for (const cartItem of cart.items) {
      const productId = cartItem.product?._id || cartItem.product;

      const product = await Product.findOne({
        _id: productId,
        isActive: true
      });

      if (!product) {
        throw new AppError(
          "A product in the cart is no longer available",
          404,
          [],
          "PRODUCT_NOT_FOUND"
        );
      }

      const isVariantProduct = Array.isArray(product.variants) && product.variants.length > 0;
      const requestedVariantId = cartItem.variantId || null;

      let itemPrice;
      let itemVariantId = null;
      let itemVariantName = null;
      let itemSku = null;

      if (requestedVariantId !== null) {
        if (!isVariantProduct) {
          throw new AppError(
            "This product does not have variants",
            400,
            [],
            "PRODUCT_HAS_NO_VARIANTS"
          );
        }

        const variant = product.variants.find(
          (v) => v.variantId === requestedVariantId
        );

        if (!variant) {
          throw new AppError(
            "Requested variant not found",
            404,
            [],
            "VARIANT_NOT_FOUND"
          );
        }

        if (variant.isActive === false) {
          throw new AppError(
            "Variant is not available",
            400,
            [],
            "VARIANT_INACTIVE"
          );
        }

        if (variant.stock < cartItem.quantity) {
          throw new AppError(
            `Insufficient stock for ${product.name}`,
            400,
            [],
            "INSUFFICIENT_STOCK"
          );
        }

        itemPrice = (variant.price !== null && variant.price !== undefined)
          ? variant.price
          : product.price;

        itemVariantId = variant.variantId;
        itemVariantName = resolveVariantName(variant);
        itemSku = variant.sku || null;
      } else {
        if (isVariantProduct) {
          throw new AppError(
            "A variant must be selected for this product",
            400,
            [],
            "VARIANT_REQUIRED"
          );
        }

        if (product.stock < cartItem.quantity) {
          throw new AppError(
            `Insufficient stock for ${product.name}`,
            400,
            [],
            "INSUFFICIENT_STOCK"
          );
        }

        itemPrice = product.price;
        itemVariantId = null;
        itemVariantName = null;
        itemSku = product.sku || null;
      }

      const itemSubtotal = itemPrice * cartItem.quantity;

      const orderItem = {
        product: product._id,
        name: product.name,
        price: itemPrice,
        quantity: cartItem.quantity,
        subtotal: itemSubtotal
      };

      if (itemVariantId !== null) {
        orderItem.variantId = itemVariantId;
        orderItem.variantName = itemVariantName;
        orderItem.sku = itemSku;
      } else if (itemSku) {
        orderItem.sku = itemSku;
      }

      orderItems.push(orderItem);

      eligibleCartItems.push({
        product,
        quantity: cartItem.quantity
      });

      totalQuantity += cartItem.quantity;
      subtotal += itemSubtotal;
    }

    let coupon = null;
    let discountAmount = 0;

    if (couponCode) {
      const normalizedCode = normalizeCouponCode(couponCode);
      coupon = await Coupon.findOne({ normalizedCode });

      if (!coupon) {
        throw new AppError(
          "Coupon not found",
          404,
          [],
          "COUPON_NOT_FOUND"
        );
      }

      const evalResult = evaluateCouponEligibility(coupon, {
        cartItems: eligibleCartItems,
        subtotal
      });

      if (!evalResult.isValid) {
        throw new AppError(
          evalResult.error.message,
          evalResult.error.statusCode,
          [],
          evalResult.error.code
        );
      }

      // Pre-flight per-user usage check
      const userUsageCount = await CouponUsage.countDocuments({
        coupon: coupon._id,
        user: req.user._id,
        status: "redeemed"
      });

      const userReservationCount = await CouponReservation.countDocuments({
        coupon: coupon._id,
        user: req.user._id
      });

      const effectiveUserCount = Math.max(userUsageCount, userReservationCount);
      if (effectiveUserCount >= (coupon.perUserLimit || 1)) {
        throw new AppError(
          "Coupon usage limit reached for this account",
          400,
          [],
          "COUPON_USER_USAGE_LIMIT_REACHED"
        );
      }

      discountAmount = evalResult.discountAmount;
    }

    const financials = calculateOrderFinancials(subtotal, {
      shippingAmount: 0,
      taxAmount: 0,
      discountAmount
    });

    const shippingAddress = {
      fullName: address.fullName,
      phone: address.phone,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country
    };

    const reservationId = crypto.randomUUID();

    const orderPayload = {
      user: req.user._id,
      items: orderItems,
      totalQuantity,
      subtotal: financials.subtotal,
      shippingAmount: financials.shippingAmount,
      taxAmount: financials.taxAmount,
      discountAmount: financials.discountAmount,
      total: financials.total,
      payment: {
        provider: "razorpay",
        status: "pending",
        transactionId: ""
      },
      shippingAddress,
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: {
        reservationId: coupon ? reservationId : null,
        couponId: coupon ? coupon._id : null,
        restoredItems: orderItems.map((item) => ({
          product: item.product,
          variantId: item.variantId || null,
          quantity: item.quantity,
          deducted: false,
          restorationState: "pending",
          restored: false,
          restorationKey: crypto.randomUUID()
        }))
      }
    };

    if (coupon) {
      orderPayload.coupon = {
        couponId: coupon._id,
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        discountAmount: financials.discountAmount
      };
    }

    // Step 2 Checkpoint: Establish durable Order in MongoDB BEFORE side effects occur
    const createdOrder = await Order.create(orderPayload);

    const deductedItems = [];
    let reservedCoupon = null;
    let couponReserved = false;
    let userReservation = null;
    let createdCouponUsage = null;

    try {
      for (const item of orderItems) {
        let updatedProduct;

        if (item.variantId) {
          updatedProduct = await Product.findOneAndUpdate(
            {
              _id: item.product,
              isActive: true,
              variants: {
                $elemMatch: {
                  variantId: item.variantId,
                  isActive: { $ne: false },
                  stock: { $gte: item.quantity }
                }
              }
            },
            {
              $inc: {
                "variants.$.stock": -item.quantity
              }
            },
            {
              new: true
            }
          );
        } else {
          updatedProduct = await Product.findOneAndUpdate(
            {
              _id: item.product,
              isActive: true,
              stock: { $gte: item.quantity }
            },
            {
              $inc: {
                stock: -item.quantity
              }
            },
            {
              new: true
            }
          );
        }

        if (!updatedProduct) {
          const productExists = await Product.findOne({
            _id: item.product,
            isActive: true
          });

          if (!productExists) {
            throw new AppError(
              "A product in the cart is no longer available",
              404,
              [],
              "PRODUCT_NOT_FOUND"
            );
          }

          if (item.variantId) {
            const variantExists = productExists.variants?.find(
              (v) => v.variantId === item.variantId
            );

            if (!variantExists) {
              throw new AppError(
                "Requested variant not found",
                404,
                [],
                "VARIANT_NOT_FOUND"
              );
            }

            if (variantExists.isActive === false) {
              throw new AppError(
                "Requested variant is not available",
                400,
                [],
                "VARIANT_INACTIVE"
              );
            }
          }

          throw new AppError(
            `Insufficient stock for ${item.name}`,
            400,
            [],
            "INSUFFICIENT_STOCK"
          );
        }

        // Durably mark item deducted on the Order checkpoint
        const updateFilter = item.variantId
          ? {
              _id: createdOrder._id,
              "checkoutCompensation.restoredItems": {
                $elemMatch: {
                  product: item.product,
                  variantId: item.variantId
                }
              }
            }
          : {
              _id: createdOrder._id,
              "checkoutCompensation.restoredItems.product": item.product
            };

        await Order.updateOne(
          updateFilter,
          {
            $set: { "checkoutCompensation.restoredItems.$.deducted": true }
          }
        );

        const compItem = createdOrder.checkoutCompensation?.restoredItems?.find(
          (ci) =>
            String(ci.product?._id || ci.product) === String(item.product) &&
            (item.variantId ? ci.variantId === item.variantId : !ci.variantId)
        );
        if (compItem) {
          compItem.deducted = true;
        }

        deductedItems.push(item);
      }

      if (coupon) {
        // 1. Atomic global usage reservation with ownership token
        reservedCoupon = await Coupon.findOneAndUpdate(
          {
            _id: coupon._id,
            isActive: true,
            $or: [
              { usageLimit: null },
              { $expr: { $lt: ["$usedCount", "$usageLimit"] } }
            ]
          },
          {
            $inc: {
              usedCount: 1
            },
            $push: {
              reservations: reservationId
            }
          },
          {
            new: true
          }
        );

        if (!reservedCoupon) {
          throw new AppError(
            "Coupon usage limit has been reached",
            400,
            [],
            "COUPON_USAGE_LIMIT_REACHED"
          );
        }

        couponReserved = true;

        // 2. Atomic per-user slot reservation linked to createdOrder
        const limit = coupon.perUserLimit || 1;
        const existingUserUsages = await CouponUsage.countDocuments({
          coupon: coupon._id,
          user: req.user._id,
          status: "redeemed"
        });

        const existingUserReservations = await CouponReservation.find({
          coupon: coupon._id,
          user: req.user._id
        });

        const occupiedSlots = new Set();
        for (let i = 1; i <= existingUserUsages; i++) {
          occupiedSlots.add(i);
        }
        for (const resDoc of existingUserReservations) {
          occupiedSlots.add(resDoc.slotNumber);
        }

        for (let s = 1; s <= limit; s++) {
          if (occupiedSlots.has(s)) continue;

          try {
            userReservation = await CouponReservation.create({
              coupon: coupon._id,
              user: req.user._id,
              slotNumber: s,
              reservationId,
              status: "reserved",
              order: createdOrder._id
            });
            break;
          } catch (slotErr) {
            if (slotErr.code === 11000) {
              occupiedSlots.add(s);
              continue;
            }
            throw slotErr;
          }
        }

        if (!userReservation) {
          throw new AppError(
            "Coupon usage limit reached for this account",
            400,
            [],
            "COUPON_USER_USAGE_LIMIT_REACHED"
          );
        }
      }

      if (reservedCoupon) {
        try {
          createdCouponUsage = await CouponUsage.create({
            coupon: reservedCoupon._id,
            user: req.user._id,
            order: createdOrder._id,
            couponCode: reservedCoupon.code,
            discountAmount: financials.discountAmount,
            status: "redeemed",
            redeemedAt: new Date()
          });
        } catch (usageErr) {
          if (usageErr.code === 11000) {
            throw new AppError(
              "Coupon has already been redeemed for this order",
              400,
              [],
              "COUPON_USER_USAGE_LIMIT_REACHED"
            );
          }
          throw usageErr;
        }

        // On successful order and usage creation:
        // Convert reservation into completed state:
        // 1. Release the reservation token from Coupon.reservations (keeping usedCount incremented)
        await Coupon.updateOne(
          { _id: reservedCoupon._id },
          { $pull: { reservations: reservationId } }
        );

        // 2. Mark userReservation as consumed
        if (userReservation) {
          await CouponReservation.updateOne(
            { _id: userReservation._id },
            {
              $set: {
                status: "consumed",
                order: createdOrder._id
              }
            }
          );
        }
      }

      // Transition order checkpoint from "in_progress" to "none"
      await Order.findByIdAndUpdate(createdOrder._id, {
        $set: { checkoutState: "none" }
      });
      createdOrder.checkoutState = "none";

      // Cart clearing strictly occurs ONLY after all order, coupon, and usage operations succeed
      cart.items = [];
      cart.coupon = null;

      await cart.save();

      return res.status(201).json({
        success: true,
        message: "Order created successfully",
        data: {
          order: createdOrder
        },
        requestId: req.requestId
      });
    } catch (error) {
      if (createdOrder?._id) {
        await compensateOrderRedemption({
          orderId: createdOrder._id,
          createdOrder,
          createdCouponUsage,
          userReservation,
          reservedCoupon: couponReserved ? reservedCoupon : null,
          reservationId,
          deductedItems,
          logger: req.log
        });
      }

      // Preserve and re-throw original checkout error
      throw error;
    }
  } catch (error) {
    next(error);
  }
}

export {
  createOrder
};
