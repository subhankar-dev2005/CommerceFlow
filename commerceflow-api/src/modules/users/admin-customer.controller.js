import mongoose from "mongoose";
import User from "./user.model.js";
import Address from "./address.model.js";
import Order from "../orders/order.model.js";
import escapeRegex from "../../utils/escape-regex.js";
import AppError from "../../common/errors/app-error.js";
import { logger } from "../../config/logger.js";
import { recordAdminAuditEvent, AUDIT_EVENT_TYPES } from "../audit/admin-audit.service.js";

/**
 * GET /api/v1/admin/customers
 * Production-grade admin customer listing with server-side pagination,
 * status filtering, safe regex search, and deterministic sorting.
 */
export async function getAdminCustomers(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      50
    );
    const skip = (page - 1) * limit;

    // 1. Mandatory customer role isolation (never expose admin accounts)
    const filter = { role: "customer" };

    // 2. Account status filter
    const status = req.query.status || "all";
    if (status === "active") {
      filter.isActive = true;
    } else if (status === "inactive") {
      filter.isActive = false;
    }

    // 3. Safe, bounded regex search across name and email
    if (req.query.search && typeof req.query.search === "string") {
      const trimmed = req.query.search.trim();
      if (trimmed) {
        const escaped = escapeRegex(trimmed);
        const searchRegex = new RegExp(escaped, "i");
        filter.$or = [
          { name: searchRegex },
          { email: searchRegex }
        ];
      }
    }

    // 4. Count total matching customers
    const totalCustomers = await User.countDocuments(filter);

    // 5. Deterministic sorting with _id secondary tie-breaker
    const allowedSortFields = ["createdAt", "name", "email"];
    const sortField = allowedSortFields.includes(req.query.sortBy)
      ? req.query.sortBy
      : "createdAt";
    const sortDirection = req.query.sortOrder === "asc" ? 1 : -1;

    const sortQuery = {
      [sortField]: sortDirection,
      _id: sortDirection
    };

    // 6. Explicit safe projection excluding password, hashes, and secrets
    const customers = await User.find(filter)
      .select("_id name email role isActive createdAt updatedAt")
      .sort(sortQuery)
      .skip(skip)
      .limit(limit)
      .lean();

    const formattedCustomers = customers.map((c) => ({
      id: c._id.toString(),
      _id: c._id.toString(),
      name: c.name,
      email: c.email,
      role: c.role,
      isActive: c.isActive,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }));

    const totalPages = Math.max(Math.ceil(totalCustomers / limit), 1);

    return res.status(200).json({
      success: true,
      message: "Admin customers retrieved successfully",
      data: {
        customers: formattedCustomers,
        pagination: {
          page,
          limit,
          totalCustomers,
          total: totalCustomers,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/customers/:customerId
 * Retrieves detailed customer profile, addresses, order statistics, and recent orders.
 */
export async function getAdminCustomerById(req, res, next) {
  try {
    const { customerId } = req.params;

    // 1. Resolve customer profile strictly restricted to role: "customer"
    const customer = await User.findOne({
      _id: customerId,
      role: "customer"
    })
      .select("_id name email role isActive createdAt updatedAt")
      .lean();

    if (!customer) {
      throw new AppError("Customer not found", 404, [], "CUSTOMER_NOT_FOUND");
    }

    // 2. Fetch customer addresses, order stats, and recent orders in parallel
    const [addresses, statsResult, recentOrders] = await Promise.all([
      Address.find({ user: customerId })
        .sort({ isDefault: -1, createdAt: -1 })
        .select("_id fullName phone addressLine1 addressLine2 city state postalCode country isDefault createdAt updatedAt")
        .lean(),

      Order.aggregate([
        {
          $match: {
            user: new mongoose.Types.ObjectId(customerId)
          }
        },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalSpent: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$status", "cancelled"] },
                      { $eq: ["$payment.status", "paid"] }
                    ]
                  },
                  "$total",
                  0
                ]
              }
            },
            lastOrderDate: { $max: "$createdAt" }
          }
        }
      ]),

      Order.find({ user: customerId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("_id status payment.status shipment.status total totalQuantity createdAt")
        .lean()
    ]);

    // 3. Format addresses safely
    const formattedAddresses = addresses.map((addr) => ({
      id: addr._id.toString(),
      _id: addr._id.toString(),
      fullName: addr.fullName,
      phone: addr.phone,
      addressLine1: addr.addressLine1,
      addressLine2: addr.addressLine2,
      city: addr.city,
      state: addr.state,
      postalCode: addr.postalCode,
      country: addr.country,
      isDefault: addr.isDefault,
      createdAt: addr.createdAt,
      updatedAt: addr.updatedAt
    }));

    // 4. Format order statistics with safe defaults
    const stats = statsResult[0] || {};
    const orderStats = {
      totalOrders: stats.totalOrders || 0,
      totalSpent: Math.round((stats.totalSpent || 0) * 100) / 100,
      lastOrderDate: stats.lastOrderDate || null
    };

    // 5. Format recent orders safely (omits internal/provider secrets)
    const formattedRecentOrders = recentOrders.map((order) => ({
      id: order._id.toString(),
      _id: order._id.toString(),
      status: order.status,
      paymentStatus: order.payment?.status ?? "pending",
      shipmentStatus: order.shipment?.status ?? null,
      total: order.total ?? 0,
      itemCount: order.totalQuantity ?? 0,
      createdAt: order.createdAt
    }));

    return res.status(200).json({
      success: true,
      message: "Admin customer retrieved successfully",
      data: {
        customer: {
          id: customer._id.toString(),
          _id: customer._id.toString(),
          name: customer.name,
          email: customer.email,
          role: customer.role,
          isActive: customer.isActive,
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt
        },
        addresses: formattedAddresses,
        orderStats,
        recentOrders: formattedRecentOrders
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/admin/customers/:customerId/status
 * Atomically activates or deactivates a customer account.
 * Scoped strictly to role: "customer" with self-deactivation protection.
 */
export async function updateAdminCustomerStatus(req, res, next) {
  try {
    const { customerId } = req.params;
    const { isActive } = req.body;

    // 1. Self-deactivation protection: Admin cannot deactivate their own account
    if (req.user && req.user._id && req.user._id.toString() === customerId) {
      throw new AppError("Customer not found", 404, [], "CUSTOMER_NOT_FOUND");
    }

    // 2. Atomic, customer-only update preventing race conditions & admin account mutation
    const customer = await User.findOneAndUpdate(
      {
        _id: customerId,
        role: "customer"
      },
      {
        $set: { isActive }
      },
      {
        new: true,
        runValidators: true
      }
    )
      .select("_id name email role isActive createdAt updatedAt")
      .lean();

    if (!customer) {
      throw new AppError("Customer not found", 404, [], "CUSTOMER_NOT_FOUND");
    }

    // 3. Emit structured audit log
    logger.info(
      {
        event: "ADMIN_CUSTOMER_STATUS_UPDATED",
        adminId: req.user?._id,
        targetCustomerId: customer._id,
        isActive: customer.isActive
      },
      "Admin updated customer status"
    );

    if (req.user) {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.ADMIN_CUSTOMER_STATUS_UPDATED,
        target: customer,
        resourceType: "customer",
        resourceId: customer._id?.toString(),
        metadata: {
          customerEmail: customer.email,
          isActive: customer.isActive
        },
        req
      }).catch((auditErr) => {
        req.log?.error?.({ err: auditErr }, "Failed to record customer status audit log");
      });
    }

    // 4. Return safe customer projection
    return res.status(200).json({
      success: true,
      message: "Customer status updated successfully",
      data: {
        customer: {
          id: customer._id.toString(),
          _id: customer._id.toString(),
          name: customer.name,
          email: customer.email,
          role: customer.role,
          isActive: customer.isActive,
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

export default getAdminCustomers;
