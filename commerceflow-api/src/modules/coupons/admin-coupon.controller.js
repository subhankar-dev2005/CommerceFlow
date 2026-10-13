import Coupon from "./coupon.model.js";
import AppError from "../../common/errors/app-error.js";
import { normalizeCouponCode } from "./coupon.validator.js";
import escapeRegex from "../../utils/escape-regex.js";

/**
 * POST /api/v1/admin/coupons
 * Creates a new promotional coupon.
 * Accessible strictly by administrators.
 */
export async function createCoupon(req, res, next) {
  try {
    const {
      code,
      type,
      value,
      minimumSubtotal,
      maximumDiscount,
      startsAt,
      expiresAt,
      usageLimit,
      perUserLimit,
      applicableProducts,
      applicableCategories,
      isActive
    } = req.body;

    const normalizedCode = normalizeCouponCode(code);

    const existing = await Coupon.findOne({ normalizedCode });
    if (existing) {
      throw new AppError(
        "A coupon with this code already exists",
        409,
        [{ field: "code", message: "Coupon code is already in use" }],
        "COUPON_ALREADY_EXISTS"
      );
    }

    try {
      const coupon = await Coupon.create({
        code,
        normalizedCode,
        type,
        value,
        minimumSubtotal: minimumSubtotal ?? 0,
        maximumDiscount: maximumDiscount ?? null,
        startsAt: startsAt ? new Date(startsAt) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        usageLimit: usageLimit ?? null,
        usedCount: 0,
        perUserLimit: perUserLimit ?? 1,
        applicableProducts: applicableProducts || [],
        applicableCategories: applicableCategories || [],
        isActive: isActive !== undefined ? isActive : true
      });

      return res.status(201).json({
        success: true,
        message: "Coupon created successfully",
        data: {
          coupon
        },
        requestId: req.requestId
      });
    } catch (error) {
      if (error?.code === 11000) {
        throw new AppError(
          "A coupon with this code already exists",
          409,
          [{ field: "code", message: "Coupon code is already in use" }],
          "COUPON_ALREADY_EXISTS"
        );
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/coupons
 * Retrieves paginated list of coupons with optional status, type, and search filters.
 */
export async function getAdminCoupons(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      100
    );
    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === "true";
    }

    if (req.query.type) {
      filter.type = req.query.type;
    }

    if (req.query.search && typeof req.query.search === "string") {
      const search = req.query.search.trim();
      if (search) {
        const escaped = escapeRegex(search);
        filter.$or = [
          { code: { $regex: escaped, $options: "i" } },
          { normalizedCode: { $regex: normalizeCouponCode(escaped), $options: "i" } }
        ];
      }
    }

    const totalCoupons = await Coupon.countDocuments(filter);

    const sortField = req.query.sortBy || "createdAt";
    const sortDirection = req.query.sortOrder === "asc" ? 1 : -1;
    const sortQuery = {
      [sortField]: sortDirection,
      _id: sortDirection
    };

    const coupons = await Coupon.find(filter)
      .select("-__v")
      .sort(sortQuery)
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPages = Math.max(Math.ceil(totalCoupons / limit), 1);

    return res.status(200).json({
      success: true,
      message: "Admin coupons retrieved successfully",
      data: {
        coupons,
        pagination: {
          page,
          limit,
          totalCoupons,
          totalPages
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/coupons/:couponId
 * Retrieves detailed configuration for a specific coupon.
 */
export async function getCouponById(req, res, next) {
  try {
    const { couponId } = req.params;

    const coupon = await Coupon.findById(couponId).select("-__v");
    if (!coupon) {
      throw new AppError(
        "Coupon not found",
        404,
        [],
        "COUPON_NOT_FOUND"
      );
    }

    return res.status(200).json({
      success: true,
      message: "Coupon details retrieved successfully",
      data: {
        coupon
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/admin/coupons/:couponId
 * Updates permitted configuration fields of an existing coupon.
 * Strictly prevents modification of runtime counters (e.g. usedCount).
 */
export async function updateCoupon(req, res, next) {
  try {
    const { couponId } = req.params;

    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
      throw new AppError(
        "Coupon not found",
        404,
        [],
        "COUPON_NOT_FOUND"
      );
    }

    // Handle code update and uniqueness verification
    if (req.body.code !== undefined) {
      const newNormalized = normalizeCouponCode(req.body.code);
      if (newNormalized !== coupon.normalizedCode) {
        const existing = await Coupon.findOne({
          normalizedCode: newNormalized,
          _id: { $ne: couponId }
        });

        if (existing) {
          throw new AppError(
            "A coupon with this code already exists",
            409,
            [{ field: "code", message: "Coupon code is already in use" }],
            "COUPON_ALREADY_EXISTS"
          );
        }

        coupon.code = req.body.code.trim();
        coupon.normalizedCode = newNormalized;
      }
    }

    // Whitelist updates to permitted fields
    if (req.body.type !== undefined) coupon.type = req.body.type;
    if (req.body.value !== undefined) coupon.value = req.body.value;
    if (req.body.minimumSubtotal !== undefined) coupon.minimumSubtotal = req.body.minimumSubtotal;
    if (req.body.maximumDiscount !== undefined) coupon.maximumDiscount = req.body.maximumDiscount;
    if (req.body.startsAt !== undefined) {
      coupon.startsAt = req.body.startsAt ? new Date(req.body.startsAt) : null;
    }
    if (req.body.expiresAt !== undefined) {
      coupon.expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
    }
    if (req.body.usageLimit !== undefined) coupon.usageLimit = req.body.usageLimit;
    if (req.body.perUserLimit !== undefined) coupon.perUserLimit = req.body.perUserLimit;
    if (req.body.applicableProducts !== undefined) coupon.applicableProducts = req.body.applicableProducts;
    if (req.body.applicableCategories !== undefined) coupon.applicableCategories = req.body.applicableCategories;
    if (req.body.isActive !== undefined) coupon.isActive = req.body.isActive;

    try {
      await coupon.save();

      return res.status(200).json({
        success: true,
        message: "Coupon updated successfully",
        data: {
          coupon
        },
        requestId: req.requestId
      });
    } catch (error) {
      if (error?.code === 11000) {
        throw new AppError(
          "A coupon with this code already exists",
          409,
          [{ field: "code", message: "Coupon code is already in use" }],
          "COUPON_ALREADY_EXISTS"
        );
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/admin/coupons/:couponId/status
 * Updates only the active status (activation/deactivation) of a coupon.
 */
export async function updateCouponStatus(req, res, next) {
  try {
    const { couponId } = req.params;
    const { isActive } = req.body;

    const coupon = await Coupon.findByIdAndUpdate(
      couponId,
      { $set: { isActive } },
      { new: true, runValidators: true }
    ).select("-__v");

    if (!coupon) {
      throw new AppError(
        "Coupon not found",
        404,
        [],
        "COUPON_NOT_FOUND"
      );
    }

    return res.status(200).json({
      success: true,
      message: `Coupon ${isActive ? "activated" : "deactivated"} successfully`,
      data: {
        coupon
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}
