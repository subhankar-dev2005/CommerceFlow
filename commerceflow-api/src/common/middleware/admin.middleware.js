import AppError from "../errors/app-error.js";

function adminMiddleware(
req,
res,
next
) {
if (
!req.user ||
req.user.role !== "admin"
) {
return next(
new AppError(
"Admin access required",
403,
[],
"ADMIN_ACCESS_REQUIRED"
)
);
}

next();
}

export default adminMiddleware;
