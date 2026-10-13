export function sendSuccess(
  res,
  {
    statusCode = 200,
    message = "Success",
    data = null,
    requestId = null
  } = {}
) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    requestId
  });
}