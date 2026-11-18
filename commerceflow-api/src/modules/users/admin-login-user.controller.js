import bcrypt from "bcryptjs";

import User from "./user.model.js";
import AppError from "../../common/errors/app-error.js";
import generateToken from "../../utils/generate-token.js";
import { setAuthCookie, setRefreshCookie } from "../../config/cookie.js";
import { issueRefreshToken } from "./refresh-token.service.js";
import { ADMINISTRATIVE_ROLES } from "../../config/roles.js";
import { logger } from "../../config/logger.js";
import {
  recordAdminAuditEvent,
  AUDIT_EVENT_TYPES
} from "../audit/admin-audit.service.js";

/**
 * Precomputed dummy bcrypt hash with work factor 12.
 * Used to perform a dummy comparison when an account does not exist,
 * equalizing CPU execution time to mitigate account-existence timing side-channels.
 */
const DUMMY_PASSWORD_HASH =
  "$2b$12$4KXHMoTjAWJ.hLgw8S0HtOKHG2dwjzAVF/04Xoe9bNo0OM.VHu.eO";

/**
 * POST /api/v1/users/admin/login
 *
 * Authenticates an administrator or super administrator account using email + password only.
 * In accordance with the Owner Governance Amendment (DEC-01 / DEC-03 Option 3B):
 * 1. Must verify user.role in ADMINISTRATIVE_ROLES from database BEFORE issuing a session.
 * 2. If credentials match a customer, authentication is rejected with a generic
 *    error (no role disclosure) and NO session cookie or challenge is issued.
 * 3. Enrolled and unenrolled admins authenticate directly via valid password without
 *    issuing an MFA challenge or requiring MFA setup.
 * 4. Rejects inactive accounts.
 * 5. Issues authenticated session cookies (auth_token and refresh_token) immediately.
 */
async function adminLoginUser(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      try {
        await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      } catch {
        // Defensive: prevent unexpected bcrypt failure from bypassing auth
      }
      throw new AppError(
        "Invalid email or password",
        401,
        [],
        "INVALID_CREDENTIALS"
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new AppError(
        "Invalid email or password",
        401,
        [],
        "INVALID_CREDENTIALS"
      );
    }

    if (user.isActive === false) {
      throw new AppError(
        "User account is deactivated",
        401,
        [],
        "ACCOUNT_DEACTIVATED"
      );
    }

    // Explicit database role verification — reject non-administrative users
    if (!ADMINISTRATIVE_ROLES.includes(user.role)) {
      throw new AppError(
        "Invalid email or password",
        401,
        [],
        "INVALID_CREDENTIALS"
      );
    }

    // Direct session issuance for authorized administrator (DEC-01 / DEC-03 Option 3B)
    const tokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role
    };
    if (user.tokenVersion) {
      tokenPayload.tokenVersion = user.tokenVersion;
    }

    const token = generateToken(tokenPayload);

    const { plaintextToken } = await issueRefreshToken({
      userId: user._id,
      audience: "admin",
      tokenVersion: user.tokenVersion ?? 0
    });

    setAuthCookie(res, token);
    setRefreshCookie(res, plaintextToken);

    // Record administrative audit event for successful password-only login
    await recordAdminAuditEvent({
      eventType: AUDIT_EVENT_TYPES.ADMIN_LOGIN_SUCCESS,
      req,
      actor: {
        _id: user._id,
        email: user.email,
        role: user.role
      },
      target: {
        _id: user._id,
        email: user.email,
        role: user.role
      },
      resourceType: "admin_user",
      resourceId: user._id.toString(),
      metadata: {
        method: "password",
        mfaEnabled: false
      }
    }).catch((auditErr) => {
      logger.error(
        { err: auditErr, userId: user._id },
        "Failed to record audit event for admin password login"
      );
    });

    return res.status(200).json({
      success: true,
      message: "Admin logged in successfully",
      data: {
        mfaRequired: false,
        mfaEnrollmentRequired: false,
        user: {
          id: user._id.toString(),
          _id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
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

export default adminLoginUser;
