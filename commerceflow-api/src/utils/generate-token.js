import jwt from "jsonwebtoken";

import { env } from "../config/env.js";

function generateToken(payload) {
  const tokenPayload = {
    ...payload,
    tokenVersion: payload?.tokenVersion ?? 0
  };
  return jwt.sign(
    tokenPayload,
    env.JWT_SECRET,
    {
      expiresIn: env.JWT_EXPIRES_IN
    }
  );
}

export default generateToken;
