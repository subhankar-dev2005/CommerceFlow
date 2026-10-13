import { randomUUID } from "node:crypto";

function requestIdMiddleware(
  req,
  res,
  next
) {
  const requestId =
    req.header("x-request-id") ||
    randomUUID();

  req.requestId = requestId;

  res.setHeader(
    "x-request-id",
    requestId
  );

  next();
}

export default requestIdMiddleware;