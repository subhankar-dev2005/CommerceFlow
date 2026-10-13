import jwt from "jsonwebtoken";

import { env } from "../config/env.js";

function verifyToken(token) {
  return jwt.verify(
    token,
    env.JWT_SECRET
  );
}

export default verifyToken;