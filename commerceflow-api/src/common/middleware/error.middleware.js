import { logger } from "../../config/logger.js";

function errorMiddleware(
  error,
  req,
  res,
  next
) {
  if (error?.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body is too large",
        details: []
      },
      requestId:
        req.requestId || null
    });
  }
  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Request body contains invalid JSON",
        details: []
      },
      requestId:
        req.requestId || null
    });
  }
  let statusCode = 500;
  let errorCode = "INTERNAL_SERVER_ERROR";
  let message = "Internal server error";
  let details = [];

  if (error?.code === 11000) {
    statusCode = 409;
    errorCode = "DUPLICATE_RESOURCE";
    message = "Resource already exists";
    details = [];
  } else if (error?.name === "CastError") {
    statusCode = 400;
    errorCode = "INVALID_ID";
    message = "Invalid resource identifier";
    details = [];
  } else if (error?.name === "ValidationError") {
    statusCode = 400;
    errorCode = "VALIDATION_ERROR";
    message = "Validation failed";
    details =
      error.errors && typeof error.errors === "object"
        ? Object.keys(error.errors).map((key) => ({
            field: error.errors[key]?.path || key,
            message: error.errors[key]?.message || "Invalid value"
          }))
        : [];
  } else if (error?.isOperational === true) {
    statusCode =
      Number.isInteger(error.statusCode)
        ? error.statusCode
        : 500;
    errorCode =
      error.code || "INTERNAL_SERVER_ERROR";
    message = error.message;
    details =
      Array.isArray(error.errors)
        ? error.errors
        : [];
  } else if (Number.isInteger(error?.statusCode)) {
    statusCode = error.statusCode;
  }

  logger.error(
    {
      err: error,
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode,
      errorCode
    },
    message
  );

  const response = {
    success: false,

    error: {
      code: errorCode,

      message,

      details
    },

    requestId:
      req.requestId || null
  };

  return res
    .status(statusCode)
    .json(response);
}

export default errorMiddleware;
