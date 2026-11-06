import AppError from "../errors/app-error.js";
import { ROLE_EXPANSIONS } from "../../config/roles.js";

function authorize(...allowedRoles) {
  // Precompute effective permitted roles via explicit declarative expansions
  const effectiveRoles = new Set(
    allowedRoles.flatMap((role) => ROLE_EXPANSIONS[role] || [role])
  );

  return function (
    req,
    res,
    next
  ) {
    if (!req.user) {
      return next(
        new AppError(
          "Authentication is required",
          401,
          [],
          "AUTH_REQUIRED"
        )
      );
    }

    if (
      !effectiveRoles.has(
        req.user.role
      )
    ) {
      return next(
        new AppError(
          "You do not have permission to access this resource",
          403,
          [],
          "FORBIDDEN"
        )
      );
    }

    next();
  };
}

export default authorize;