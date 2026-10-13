class AppError extends Error {
  constructor(
    message,
    statusCode = 500,
    errors = [],
    code = "INTERNAL_SERVER_ERROR"
  ) {
    super(message);

    this.name = "AppError";
    this.statusCode = statusCode;
    this.errors = errors;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(
      this,
      this.constructor
    );
  }
}

export default AppError;