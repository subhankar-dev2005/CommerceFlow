import Cart from "./cart.model.js";

import AppError from "../../common/errors/app-error.js";

async function clearCart(
req,
res,
next
) {
try {
const cart =
await Cart.findOne({
user: req.user._id
});

if (!cart) {
  throw new AppError(
    "Cart not found",
    404,
    [],
    "CART_NOT_FOUND"
  );
}

cart.items = [];

await cart.save();

return res
  .status(200)
  .json({
    success: true,

    message:
      "Cart cleared successfully",

    data: {
      cart
    },

    requestId:
      req.requestId
  });

} catch (error) {
next(error);
}
}

export default clearCart;
