import Product from "../products/product.model.js";
import Order from "../orders/order.model.js";

/**
 * Authoritative sales aggregator across predefined period buckets.
 *
 * @param {'7d'|'30d'|'90d'} period
 * @returns {Promise<{ period: string, currency: string, points: Array<{ date: string, revenue: number, orderCount: number }>, totalRevenue: number }>}
 */
export async function calculateSalesOverview(period = "7d") {
  const periodDaysMap = {
    "7d": 7,
    "30d": 30,
    "90d": 90
  };

  const numDays = periodDaysMap[period] || 7;

  const now = new Date();
  const todayUTC = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const startDate = new Date(
    todayUTC.getTime() - (numDays - 1) * 24 * 60 * 60 * 1000
  );

  const grouped = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
        status: { $ne: "cancelled" },
        "payment.status": "paid"
      }
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$createdAt",
            timezone: "UTC"
          }
        },
        revenue: {
          $sum: { $ifNull: ["$total", "$subtotal"] }
        },
        orderCount: { $sum: 1 }
      }
    }
  ]);

  const dateMap = new Map();
  for (const item of grouped) {
    dateMap.set(item._id, {
      revenue: Number(item.revenue) || 0,
      orderCount: Number(item.orderCount) || 0
    });
  }

  const points = [];
  let totalRevenue = 0;

  for (let i = 0; i < numDays; i++) {
    const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split("T")[0];
    const entry = dateMap.get(dateStr) || { revenue: 0, orderCount: 0 };
    points.push({
      date: dateStr,
      revenue: entry.revenue,
      orderCount: entry.orderCount
    });
    totalRevenue += entry.revenue;
  }

  return {
    period,
    currency: "INR",
    points,
    totalRevenue
  };
}

/**
 * Authoritative top-selling products aggregator from paid order line items.
 *
 * @param {number} [limit=5]
 * @param {'7d'|'30d'|'90d'|'all'} [period='30d']
 * @returns {Promise<Array<Object>>}
 */
export async function calculateTopSellingProducts(limit = 5, period = "30d") {
  const periodDaysMap = {
    "7d": 7,
    "30d": 30,
    "90d": 90
  };

  const matchStage = {
    status: { $ne: "cancelled" },
    "payment.status": "paid"
  };

  if (period && period !== "all") {
    const numDays = periodDaysMap[period] || 30;
    const now = new Date();
    const todayUTC = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    const startDate = new Date(
      todayUTC.getTime() - (numDays - 1) * 24 * 60 * 60 * 1000
    );
    matchStage.createdAt = { $gte: startDate };
  }

  const topSelling = await Order.aggregate([
    {
      $match: matchStage
    },
    {
      $project: {
        "items.product": 1,
        "items.name": 1,
        "items.sku": 1,
        "items.quantity": 1,
        "items.subtotal": 1
      }
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.product",
        name: { $first: "$items.name" },
        sku: { $first: "$items.sku" },
        unitsSold: { $sum: "$items.quantity" },
        revenue: { $sum: "$items.subtotal" }
      }
    },
    { $sort: { unitsSold: -1, revenue: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "productDoc"
      }
    },
    {
      $project: {
        _id: 1,
        name: 1,
        sku: 1,
        unitsSold: 1,
        revenue: 1,
        image: { $arrayElemAt: ["$productDoc.image", 0] },
        category: { $arrayElemAt: ["$productDoc.category", 0] },
        stock: { $arrayElemAt: ["$productDoc.stock", 0] }
      }
    }
  ]);

  return topSelling.map((item) => ({
    _id: item._id ? item._id.toString() : null,
    productId: item._id ? item._id.toString() : null,
    name: item.name || "Unknown Product",
    sku: item.sku || null,
    unitsSold: item.unitsSold || 0,
    revenue: item.revenue || 0,
    image: item.image || null,
    category: item.category || null,
    stock: item.stock !== undefined && item.stock !== null ? item.stock : 0
  }));
}

/**
 * GET /api/v1/admin/dashboard/summary
 * Consolidated executive admin dashboard summary with authoritative server metrics.
 */
export async function getDashboardSummary(req, res, next) {
  try {
    const [
      totalProducts,
      activeProducts,
      totalOrders,
      pendingOrders,
      lowStockProducts,
      outOfStockProducts,
      categories,
      revenueAggregation,
      salesOverview,
      rawRecentOrders,
      rawRecentProducts,
      topSellingProducts
    ] = await Promise.all([
      Product.countDocuments({}),
      Product.countDocuments({ isActive: true }),
      Order.countDocuments({}),
      Order.countDocuments({ status: { $in: ["pending", "processing"] } }),
      Product.countDocuments({ stock: { $gt: 0, $lte: 5 } }),
      Product.countDocuments({ stock: 0 }),
      Product.distinct("category"),
      Order.aggregate([
        {
          $match: {
            status: { $ne: "cancelled" },
            "payment.status": "paid"
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: { $ifNull: ["$total", "$subtotal"] }
            }
          }
        }
      ]),
      calculateSalesOverview("7d"),
      Order.find({})
        .sort({ createdAt: -1 })
        .limit(6)
        .populate("user", "name email")
        .select("_id status payment.status total subtotal items totalQuantity createdAt")
        .lean(),
      Product.find({})
        .sort({ createdAt: -1 })
        .limit(6)
        .select("_id name price stock category image images isActive variants createdAt")
        .lean(),
      calculateTopSellingProducts(5, "30d")
    ]);

    const totalRevenue = revenueAggregation[0]?.totalRevenue || 0;
    const totalCategories = categories.length;

    const summary = {
      totalProducts,
      activeProducts,
      totalOrders,
      pendingOrders,
      lowStockProducts,
      outOfStockProducts,
      totalCategories,
      totalRevenue
    };

    const recentOrders = rawRecentOrders.map((order) => ({
      _id: order._id?.toString(),
      orderId: order._id?.toString(),
      customerName: order.user?.name || "Customer",
      customerEmail: order.user?.email || null,
      status: order.status,
      paymentStatus: order.payment?.status || "pending",
      total:
        order.total !== undefined && order.total !== null
          ? order.total
          : (order.subtotal || 0),
      totalQuantity: order.totalQuantity || order.items?.length || 0,
      createdAt: order.createdAt
    }));

    const recentProducts = rawRecentProducts.map((p) => {
      const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
      let firstSku = null;
      if (hasVariants) {
        firstSku = p.variants[0]?.sku || null;
      }
      return {
        _id: p._id?.toString(),
        name: p.name,
        category: p.category,
        price: p.price,
        stock: p.stock ?? 0,
        image: p.image || (hasVariants ? p.variants[0]?.images?.[0] : null) || null,
        isActive: p.isActive !== false,
        hasVariants,
        variantCount: hasVariants ? p.variants.length : 0,
        sku: firstSku,
        createdAt: p.createdAt
      };
    });

    return res.status(200).json({
      success: true,
      message: "Admin dashboard summary retrieved successfully",
      data: {
        summary,
        sales: salesOverview,
        recentOrders,
        recentProducts,
        topSellingProducts
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/dashboard/sales?period=7d
 * Period-filtered authoritative sales analytics.
 */
export async function getDashboardSales(req, res, next) {
  try {
    const period = req.query.period || "7d";
    const sales = await calculateSalesOverview(period);

    return res.status(200).json({
      success: true,
      message: "Admin dashboard sales retrieved successfully",
      data: {
        sales
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/dashboard/top-products
 * Authoritative top-selling products query.
 */
export async function getDashboardTopProducts(req, res, next) {
  try {
    const period = req.query.period || "30d";
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(rawLimit || 5, 1), 50);
    const topSellingProducts = await calculateTopSellingProducts(limit, period);

    return res.status(200).json({
      success: true,
      message: "Admin dashboard top selling products retrieved successfully",
      data: {
        topSellingProducts
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}
