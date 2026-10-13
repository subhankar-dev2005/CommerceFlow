import AppError from "../errors/app-error.js";

function authorize(...allowedRoles) {
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
      !allowedRoles.includes(
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