import Product from "./product.model.js";
import AppError from "../../common/errors/app-error.js";

async function getProduct(
  req,
  res,
  next
) {
  try {
    const { id } = req.params;

    const product =
      await Product.findOne({
        _id: id,
        isActive: true
      });

    if (!product) {
      throw new AppError(
        "Product not found",
        404,
        [],
        "PRODUCT_NOT_FOUND"
      );
    }

    return res
      .status(200)
      .json({
        success: true,

        message:
          "Product retrieved successfully",

        data: {
          product
        },

        requestId:
          req.requestId
      });
  } catch (error) {
    next(error);
  }
}

export default getProduct;