
import { Router } from "express";

import validate from "../../common/middleware/validate.middleware.js";
import authMiddleware from "../../common/middleware/auth.middleware.js";

import registerUser from "./user.controller.js";
import registerUserSchema from "./user.validator.js";

import loginUser from "./login-user.controller.js";
import adminLoginUser from "./admin-login-user.controller.js";
import loginUserSchema from "./login-user.validator.js";
import logoutUser from "./logout-user.controller.js";
import logoutAllUser from "./logout-all.controller.js";
import refreshToken from "./refresh-token.controller.js";
import refreshCsrfMiddleware from "./refresh-csrf.middleware.js";

import getProfile from "./profile.controller.js";
import getMe from "./get-me.controller.js";

import updateProfile from "./update-profile.controller.js";
import updateProfileSchema from "./update-profile.validator.js";

import changePassword from "./change-password.controller.js";
import changePasswordSchema from "./change-password.validator.js";

import {
  createAddressSchema,
  updateAddressSchema,
  addressIdSchema
} from "./address.validator.js";

import {
  createAddress,
  getAddresses,
  updateAddress,
  setDefaultAddress,
  deleteAddress
} from "./address.controller.js";

import {
  authRateLimitMiddleware,
  registerRateLimitMiddleware,
  refreshRateLimitMiddleware
} from "../../common/middleware/auth-rate-limit.middleware.js";
const router = Router();

router.post(
  "/register",
  registerRateLimitMiddleware,
  validate(registerUserSchema),
  registerUser
);

router.post(
  "/login",
  authRateLimitMiddleware,
  validate(loginUserSchema),
  loginUser
);

router.post(
  "/admin/login",
  authRateLimitMiddleware,
  validate(loginUserSchema),
  adminLoginUser
);

router.post(
  "/logout",
  logoutUser
);

router.post(
  "/logout-all",
  authMiddleware,
  logoutAllUser
);

router.post(
  "/refresh",
  refreshRateLimitMiddleware,
  refreshCsrfMiddleware,
  refreshToken
);

router.get(
  "/profile",
  authMiddleware,
  getProfile
);

router.get(
  "/me",
  authMiddleware,
  getMe
);

router.patch(
  "/me",
  authMiddleware,
  validate(updateProfileSchema),
  updateProfile
);

router.patch(
  "/me/password",
  authMiddleware,
  validate(changePasswordSchema),
  changePassword
);

router.post(
  "/me/addresses",
  authMiddleware,
  validate(createAddressSchema),
  createAddress
);

router.get(
  "/me/addresses",
  authMiddleware,
  getAddresses
);

router.patch(
  "/me/addresses/:addressId",
  authMiddleware,
  validate(updateAddressSchema),
  updateAddress
);

router.patch(
  "/me/addresses/:addressId/default",
  authMiddleware,
  validate(addressIdSchema),
  setDefaultAddress
);

router.delete(
  "/me/addresses/:addressId",
  authMiddleware,
  validate(addressIdSchema),
  deleteAddress
);

export default router;
