import bcrypt from "bcryptjs";
import User from "./user.model.js";
import escapeRegex from "../../utils/escape-regex.js";
import AppError from "../../common/errors/app-error.js";
import { logger } from "../../config/logger.js";
import {
  recordAdminAuditEvent,
  AUDIT_EVENT_TYPES
} from "../audit/admin-audit.service.js";

/**
 * GET /api/v1/admin/users
 * Lists user accounts with server-side pagination, search, role filtering,
 * status filtering, and deterministic sorting.
 */
export async function getAdminUsers(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      50
    );
    const skip = (page - 1) * limit;

    const filter = {};

    // 1. Role filter
    const role = req.query.role || "all";
    if (role === "admin" || role === "customer") {
      filter.role = role;
    }

    // 2. Status filter
    const status = req.query.status || "all";
    if (status === "active") {
      filter.isActive = true;
    } else if (status === "inactive") {
      filter.isActive = false;
    }

    // 3. Search query across name and email
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

    // 4. Count matching records
    const totalUsers = await User.countDocuments(filter);

    // 5. Deterministic sorting
    const allowedSortFields = ["createdAt", "name", "email", "role"];
    const sortField = allowedSortFields.includes(req.query.sortBy)
      ? req.query.sortBy
      : "createdAt";
    const sortDirection = req.query.sortOrder === "asc" ? 1 : -1;

    const sortQuery = {
      [sortField]: sortDirection,
      _id: sortDirection
    };

    // 6. Safe projection strictly omitting password, hashes, and internal tokens
    const users = await User.find(filter)
      .select("_id name email role isActive createdAt updatedAt")
      .sort(sortQuery)
      .skip(skip)
      .limit(limit)
      .lean();

    const formattedUsers = users.map((u) => ({
      id: u._id.toString(),
      _id: u._id.toString(),
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt
    }));

    const totalPages = Math.max(Math.ceil(totalUsers / limit), 1);

    return res.status(200).json({
      success: true,
      message: "Admin users retrieved successfully",
      data: {
        users: formattedUsers,
        pagination: {
          page,
          limit,
          totalUsers,
          total: totalUsers,
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
 * POST /api/v1/admin/users
 * Securely creates a new administrator account.
 * Server strictly forces role = "admin" and ignores any client-supplied role or permissions.
 */
export async function createAdminUser(req, res, next) {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new AppError(
        "Email is already registered",
        409,
        [],
        "EMAIL_ALREADY_EXISTS"
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Authoritative server-side role assignment — client cannot override
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "admin",
      isActive: true
    });

    logger.info(
      {
        event: "ADMIN_USER_CREATED",
        actingAdminId: req.user?._id,
        newAdminId: user._id,
        email: user.email,
        role: "admin"
      },
      "Administrator created a new administrator account"
    );

    // Persistent administrative audit logging with compensation
    try {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.ADMIN_USER_CREATED,
        target: user,
        metadata: {
          role: user.role,
          isActive: user.isActive
        },
        req
      });
    } catch (auditErr) {
      await User.findByIdAndDelete(user._id).catch(() => {});
      throw auditErr;
    }

    return res.status(201).json({
      success: true,
      message: "Administrator created successfully",
      data: {
        user: {
          id: user._id.toString(),
          _id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/admin/users/:userId/status
 * Updates user activation status.
 * Enforces last-active-admin protection and prevents admin self-deactivation lockout.
 */
export async function updateAdminUserStatus(req, res, next) {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      throw new AppError("User not found", 404, [], "USER_NOT_FOUND");
    }

    // Safety checks when attempting deactivation
    if (isActive === false && targetUser.isActive === true) {
      if (targetUser.role === "admin") {
        // Last-admin protection: Ensure at least one active admin remains
        const activeAdminCount = await User.countDocuments({
          role: "admin",
          isActive: true
        });

        if (activeAdminCount <= 1) {
          throw new AppError(
            "Cannot deactivate the final active administrator",
            409,
            [],
            "CANNOT_DEACTIVATE_LAST_ADMIN"
          );
        }

        // Self-protection: Prevent an administrator from deactivating their own account
        if (req.user && req.user._id && req.user._id.toString() === userId) {
          throw new AppError(
            "Administrators cannot deactivate their own account",
            400,
            [],
            "CANNOT_DEACTIVATE_SELF"
          );
        }
      }
    }

    const previousIsActive = targetUser.isActive;
    targetUser.isActive = isActive;
    await targetUser.save();

    logger.info(
      {
        event: "ADMIN_USER_STATUS_UPDATED",
        actingAdminId: req.user?._id,
        targetUserId: targetUser._id,
        isActive: targetUser.isActive,
        role: targetUser.role
      },
      "Administrator updated user status"
    );

    // Persistent administrative audit logging with compensation
    try {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.ADMIN_USER_STATUS_UPDATED,
        target: targetUser,
        metadata: {
          previousStatus: previousIsActive ? "active" : "inactive",
          newStatus: targetUser.isActive ? "active" : "inactive",
          isActive: targetUser.isActive,
          role: targetUser.role
        },
        req
      });
    } catch (auditErr) {
      targetUser.isActive = previousIsActive;
      await targetUser.save().catch(() => {});
      throw auditErr;
    }

    return res.status(200).json({
      success: true,
      message: "User status updated successfully",
      data: {
        user: {
          id: targetUser._id.toString(),
          _id: targetUser._id.toString(),
          name: targetUser.name,
          email: targetUser.email,
          role: targetUser.role,
          isActive: targetUser.isActive,
          createdAt: targetUser.createdAt,
          updatedAt: targetUser.updatedAt
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/admin/users/:userId/role
 * Controlled role management (promotion/demotion between 'admin' and 'customer').
 * Enforces last-active-admin protection and prevents admin self-demotion lockout.
 */
export async function updateAdminUserRole(req, res, next) {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      throw new AppError("User not found", 404, [], "USER_NOT_FOUND");
    }

    if (targetUser.role === role) {
      return res.status(200).json({
        success: true,
        message: "User role updated successfully",
        data: {
          user: {
            id: targetUser._id.toString(),
            _id: targetUser._id.toString(),
            name: targetUser.name,
            email: targetUser.email,
            role: targetUser.role,
            isActive: targetUser.isActive,
            createdAt: targetUser.createdAt,
            updatedAt: targetUser.updatedAt
          }
        },
        requestId: req.requestId
      });
    }

    // Demotion protection: Guard against removing the last active administrator
    if (targetUser.role === "admin" && role === "customer") {
      const activeAdminCount = await User.countDocuments({
        role: "admin",
        isActive: true
      });

      if (activeAdminCount <= 1 && targetUser.isActive === true) {
        throw new AppError(
          "Cannot demote the final active administrator",
          409,
          [],
          "CANNOT_DEMOTE_LAST_ADMIN"
        );
      }

      // Self-protection: Acting admin cannot demote their own account
      if (req.user && req.user._id && req.user._id.toString() === userId) {
        throw new AppError(
          "Administrators cannot demote their own account",
          400,
          [],
          "CANNOT_DEMOTE_SELF"
        );
      }
    }

    const previousRole = targetUser.role;
    targetUser.role = role;
    await targetUser.save();

    logger.info(
      {
        event: "ADMIN_USER_ROLE_UPDATED",
        actingAdminId: req.user?._id,
        targetUserId: targetUser._id,
        previousRole,
        newRole: targetUser.role
      },
      "Administrator updated user role"
    );

    // Persistent administrative audit logging with compensation
    try {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.ADMIN_USER_ROLE_UPDATED,
        target: targetUser,
        metadata: {
          previousRole,
          newRole: targetUser.role
        },
        req
      });
    } catch (auditErr) {
      targetUser.role = previousRole;
      await targetUser.save().catch(() => {});
      throw auditErr;
    }

    return res.status(200).json({
      success: true,
      message: "User role updated successfully",
      data: {
        user: {
          id: targetUser._id.toString(),
          _id: targetUser._id.toString(),
          name: targetUser.name,
          email: targetUser.email,
          role: targetUser.role,
          isActive: targetUser.isActive,
          createdAt: targetUser.createdAt,
          updatedAt: targetUser.updatedAt
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}
