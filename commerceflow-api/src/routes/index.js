import { Router } from "express";

import healthRoutes from "./health.routes.js";

import userRoutes from "../modules/users/user.routes.js";

import adminRoutes from "./admin.routes.js";

import productRoutes from "../modules/products/product.routes.js";

import cartRoutes from "../modules/cart/cart.routes.js";

import wishlistRoutes from "../modules/wishlist/wishlist.routes.js";

import orderRoutes from "../modules/orders/order.routes.js";

import paymentRoutes from "../modules/payments/payment.routes.js";

import recentlyViewedRoutes from "../modules/recently-viewed/recently-viewed.routes.js";
import returnRoutes from "../modules/returns/return.routes.js";
import bannerRoutes from "../modules/banners/banner.routes.js";

const router = Router();

router.use(
"/health",
healthRoutes
);

router.use(
"/users",
userRoutes
);

router.use(
"/admin",
adminRoutes
);

router.use(
"/products",
productRoutes
);

router.use(
"/cart",
cartRoutes
);

router.use(
"/wishlist",
wishlistRoutes
);

router.use(
"/orders",
orderRoutes
);

router.use(
"/payments",
paymentRoutes
);

router.use(
"/recently-viewed",
recentlyViewedRoutes
);

router.use(
"/banners",
bannerRoutes
);

router.use(
"/",
returnRoutes
);

export default router;
