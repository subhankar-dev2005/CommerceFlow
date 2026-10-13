import Product from "./product.model.js";

async function getCategories(
req,
res,
next
) {
try {
const categories =
await Product.distinct(
"category",
{
isActive: true
}
);

return res
  .status(200)
  .json({
    success: true,

    message:
      "Product categories retrieved successfully",

    data: {
      categories
    },

    requestId:
      req.requestId
  });

} catch (error) {
next(error);
}
}

export default getCategories;
