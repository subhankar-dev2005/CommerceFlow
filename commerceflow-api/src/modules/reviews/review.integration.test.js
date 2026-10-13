import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../../app.js";
import { env } from "../../config/env.js";
import User from "../users/user.model.js";
import Product from "../products/product.model.js";
import Order from "../orders/order.model.js";
import Review from "./review.model.js";
import { recalculateProductRating } from "./review.service.js";
import generateToken from "../../utils/generate-token.js";

describe("P1.2 Step 78.5 — Customer Reviews & Ratings Integration Test Suite", () => {
  let app;
  const isMongoAvailable = Boolean(env.MONGODB_URI);

  // Track all IDs created during this test suite for deterministic cleanup
  const createdUserIds = new Set();
  const createdProductIds = new Set();
  const createdOrderIds = new Set();
  const createdReviewIds = new Set();

  beforeAll(async () => {
    if (isMongoAvailable && mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI);
    }
    // Ensure all collections and indexes are ready
    await User.init();
    await Product.init();
    await Order.init();
    await Review.init();
  });

  afterAll(async () => {
    if (isMongoAvailable && mongoose.connection.readyState !== 0) {
      if (createdReviewIds.size > 0) {
        await Review.deleteMany({ _id: { $in: Array.from(createdReviewIds) } });
      }
      if (createdOrderIds.size > 0) {
        await Order.deleteMany({ _id: { $in: Array.from(createdOrderIds) } });
      }
      if (createdProductIds.size > 0) {
        await Product.deleteMany({ _id: { $in: Array.from(createdProductIds) } });
      }
      if (createdUserIds.size > 0) {
        await User.deleteMany({ _id: { $in: Array.from(createdUserIds) } });
      }
    }
  });

  beforeEach(() => {
    // Fresh app instance per test ensures clean rate-limiter state
    app = createApp();
  });

  // Helper factory functions for deterministic test fixtures
  async function createTestUser({ name = "Test User", role = "customer", isActive = true } = {}) {
    const user = await User.create({
      name,
      email: `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}@example.com`,
      password: "hashedPassword123",
      role,
      isActive
    });
    createdUserIds.add(user._id);
    return user;
  }

  async function createTestProduct({
    name = "Alpine Summit 4-Season Tent",
    price = 3000,
    stock = 15,
    category = "Tents",
    isActive = true,
    ratingAverage = 0,
    ratingCount = 0
  } = {}) {
    const product = await Product.create({
      name,
      description: "High altitude durable 4-season expedition tent",
      price,
      stock,
      category,
      isActive,
      ratingAverage,
      ratingCount
    });
    createdProductIds.add(product._id);
    return product;
  }

  async function createTestOrder({
    userId,
    productId,
    productName = "Alpine Summit 4-Season Tent",
    productPrice = 3000,
    orderStatus = "delivered",
    paymentStatus = "paid",
    createdAt
  }) {
    const orderData = {
      user: userId,
      items: [
        {
          product: productId,
          name: productName,
          price: productPrice,
          quantity: 1,
          subtotal: productPrice
        }
      ],
      totalQuantity: 1,
      subtotal: productPrice,
      shippingAmount: 0,
      taxAmount: 0,
      discountAmount: 0,
      total: productPrice,
      payment: {
        provider: "razorpay",
        status: paymentStatus,
        transactionId: `txn_${Date.now()}`,
        razorpayOrderId: `order_rzp_${Date.now()}`
      },
      shippingAddress: {
        fullName: "Test Customer",
        phone: "9876543210",
        addressLine1: "100 Mountain View Trail",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560001",
        country: "India"
      },
      status: orderStatus
    };

    if (createdAt) {
      orderData.createdAt = createdAt;
    }

    const order = await Order.create(orderData);
    createdOrderIds.add(order._id);
    return order;
  }

  function getAuthHeader(user) {
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role
    });
    return `Bearer ${token}`;
  }

  // =========================================================================
  // 1. Authentication Guards
  // =========================================================================
  describe("Authentication Guards & Protocol Verification", () => {
    it("POST /api/v1/products/:productId/reviews rejects unauthenticated request with 401", async () => {
      const product = await createTestProduct();
      const response = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .send({ rating: 5, body: "Great item for mountaineering" });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });

    it("GET /api/v1/products/:productId/reviews rejects unauthenticated request with 401", async () => {
      const product = await createTestProduct();
      const response = await request(app)
        .get(`/api/v1/products/${product._id}/reviews`);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });

    it("PATCH /api/v1/products/:productId/reviews/:reviewId rejects unauthenticated request with 401", async () => {
      const product = await createTestProduct();
      const dummyReviewId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .patch(`/api/v1/products/${product._id}/reviews/${dummyReviewId}`)
        .send({ rating: 4 });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });

    it("DELETE /api/v1/products/:productId/reviews/:reviewId rejects unauthenticated request with 401", async () => {
      const product = await createTestProduct();
      const dummyReviewId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/api/v1/products/${product._id}/reviews/${dummyReviewId}`);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });

    it("rejects invalid or tampered JWT with 401 INVALID_AUTH_TOKEN", async () => {
      const product = await createTestProduct();
      const response = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", "Bearer invalid.jwt.token")
        .send({ rating: 5, body: "Great item for mountaineering" });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_AUTH_TOKEN");
    });

    it("rejects token when user no longer exists in database", async () => {
      const ghostId = new mongoose.Types.ObjectId();
      const ghostToken = generateToken({
        userId: ghostId.toString(),
        email: "ghost@example.com",
        role: "customer"
      });
      const product = await createTestProduct();

      const response = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", `Bearer ${ghostToken}`)
        .send({ rating: 5, body: "Great item for mountaineering" });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("USER_NOT_FOUND");
    });
  });

  // =========================================================================
  // 2. POST Review — Verified Buyer Creation & Client Injection Protection
  // =========================================================================
  describe("POST /api/v1/products/:productId/reviews — Verified Creation & Client Injection Protection", () => {
    it("successfully creates a review, links qualifying order, and updates Product rating cache", async () => {
      const buyerA = await createTestUser({ name: "Buyer A" });
      const product = await createTestProduct();
      const qualifyingOrder = await createTestOrder({
        userId: buyerA._id,
        productId: product._id,
        orderStatus: "delivered",
        paymentStatus: "paid"
      });

      const response = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyerA))
        .send({
          rating: 5,
          title: "Excellent product",
          body: "The product quality is excellent."
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.review.rating).toBe(5);
      expect(response.body.data.review.isVerifiedBuyer).toBe(true);
      expect(response.body.data.review.status).toBe("published");
      expect(response.body.data.review.product.toString()).toBe(product._id.toString());
      expect(response.body.data.review.user.toString()).toBe(buyerA._id.toString());

      const createdReviewId = response.body.data.review._id;
      createdReviewIds.add(createdReviewId);

      // Verify in MongoDB: Review document exists and is strictly linked
      const savedReview = await Review.findById(createdReviewId);
      expect(savedReview).toBeTruthy();
      expect(savedReview.user.toString()).toBe(buyerA._id.toString());
      expect(savedReview.product.toString()).toBe(product._id.toString());
      expect(savedReview.order.toString()).toBe(qualifyingOrder._id.toString());
      expect(savedReview.rating).toBe(5);
      expect(savedReview.isVerifiedBuyer).toBe(true);
      expect(savedReview.status).toBe("published");

      // Verify in MongoDB: Product rating count and average are updated
      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.ratingCount).toBe(1);
      expect(updatedProduct.ratingAverage).toBe(5);
    });

    it("Section 8: rejects request when client attempts to inject order field", async () => {
      const buyerA = await createTestUser();
      const product = await createTestProduct();
      await createTestOrder({
        userId: buyerA._id,
        productId: product._id,
        orderStatus: "delivered",
        paymentStatus: "paid"
      });

      const response = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyerA))
        .send({
          rating: 5,
          title: "Test",
          body: "Valid review body.",
          order: "some-other-order-id"
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("Section 9: rejects request when client attempts to inject isVerifiedBuyer field", async () => {
      const buyerA = await createTestUser();
      const product = await createTestProduct();
      await createTestOrder({
        userId: buyerA._id,
        productId: product._id,
        orderStatus: "delivered",
        paymentStatus: "paid"
      });

      const response = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyerA))
        .send({
          rating: 5,
          title: "Test",
          body: "Valid review body.",
          isVerifiedBuyer: false
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("Section 10: rejects request when client attempts to inject status field", async () => {
      const buyerA = await createTestUser();
      const product = await createTestProduct();
      await createTestOrder({
        userId: buyerA._id,
        productId: product._id,
        orderStatus: "delivered",
        paymentStatus: "paid"
      });

      const response = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyerA))
        .send({
          rating: 5,
          title: "Test",
          body: "Valid review body.",
          status: "hidden"
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("Section 21: prevents duplicate review by same buyer on same product with 409 REVIEW_ALREADY_EXISTS", async () => {
      const buyerA = await createTestUser();
      const product = await createTestProduct();
      await createTestOrder({
        userId: buyerA._id,
        productId: product._id,
        orderStatus: "delivered",
        paymentStatus: "paid"
      });

      // First review
      const firstResponse = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyerA))
        .send({
          rating: 5,
          title: "First review",
          body: "Great item first purchase."
        });
      expect(firstResponse.status).toBe(201);
      createdReviewIds.add(firstResponse.body.data.review._id);

      // Duplicate attempt
      const duplicateResponse = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyerA))
        .send({
          rating: 4,
          title: "Second review",
          body: "Trying to submit duplicate review."
        });

      expect(duplicateResponse.status).toBe(409);
      expect(duplicateResponse.body.error.code).toBe("REVIEW_ALREADY_EXISTS");

      // Verify only 1 review document exists in MongoDB
      const reviewsInDb = await Review.countDocuments({
        user: buyerA._id,
        product: product._id
      });
      expect(reviewsInDb).toBe(1);
    });
  });

  // =========================================================================
  // 3. Purchase Eligibility Integration Matrix (Real Order Documents)
  // =========================================================================
  describe("Section 22: Purchase Eligibility Integration Matrix", () => {
    const matrixCases = [
      { orderStatus: "delivered", paymentStatus: "paid", expectedStatus: 201, allowed: true },
      { orderStatus: "delivered", paymentStatus: "pending", expectedStatus: 403, allowed: false },
      { orderStatus: "delivered", paymentStatus: "failed", expectedStatus: 403, allowed: false },
      { orderStatus: "delivered", paymentStatus: "refunded", expectedStatus: 403, allowed: false },
      { orderStatus: "pending", paymentStatus: "paid", expectedStatus: 403, allowed: false },
      { orderStatus: "confirmed", paymentStatus: "paid", expectedStatus: 403, allowed: false },
      { orderStatus: "processing", paymentStatus: "paid", expectedStatus: 403, allowed: false },
      { orderStatus: "shipped", paymentStatus: "paid", expectedStatus: 403, allowed: false },
      { orderStatus: "cancelled", paymentStatus: "paid", expectedStatus: 403, allowed: false }
    ];

    matrixCases.forEach(({ orderStatus, paymentStatus, expectedStatus, allowed }) => {
      it(`order: '${orderStatus}' + payment: '${paymentStatus}' => ${allowed ? "ALLOWED (201)" : "REJECTED (403)"}`, async () => {
        const buyer = await createTestUser();
        const product = await createTestProduct();
        await createTestOrder({
          userId: buyer._id,
          productId: product._id,
          orderStatus,
          paymentStatus
        });

        const response = await request(app)
          .post(`/api/v1/products/${product._id}/reviews`)
          .set("Authorization", getAuthHeader(buyer))
          .send({
            rating: 5,
            title: `Matrix test ${orderStatus} ${paymentStatus}`,
            body: "Testing purchase eligibility requirements strictly."
          });

        expect(response.status).toBe(expectedStatus);
        if (allowed) {
          expect(response.body.success).toBe(true);
          createdReviewIds.add(response.body.data.review._id);
        } else {
          expect(response.body.success).toBe(false);
          expect(response.body.error.code).toBe("REVIEW_PURCHASE_REQUIRED");
        }
      });
    });
  });

  // =========================================================================
  // 4. Cross-User Purchase Isolation & Repeat Purchase Behavior
  // =========================================================================
  describe("Cross-User Isolation & Repeat Purchase Behavior", () => {
    it("Section 23: Buyer B without purchase cannot review Product A", async () => {
      const buyerA = await createTestUser({ name: "Buyer A" });
      const buyerB = await createTestUser({ name: "Buyer B" });
      const productA = await createTestProduct({ name: "Product A" });
      const productB = await createTestProduct({ name: "Product B" });

      // Buyer A has qualifying order for Product A
      await createTestOrder({
        userId: buyerA._id,
        productId: productA._id,
        orderStatus: "delivered",
        paymentStatus: "paid"
      });

      // Buyer B has qualifying order for Product B, but NOT Product A
      await createTestOrder({
        userId: buyerB._id,
        productId: productB._id,
        orderStatus: "delivered",
        paymentStatus: "paid"
      });

      // Buyer B attempts to review Product A
      const response = await request(app)
        .post(`/api/v1/products/${productA._id}/reviews`)
        .set("Authorization", getAuthHeader(buyerB))
        .send({
          rating: 4,
          title: "Unverified attempt",
          body: "Trying to review product I never bought."
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("REVIEW_PURCHASE_REQUIRED");
    });

    it("Section 24: Multiple qualifying orders for same user/product links review to most recent order", async () => {
      const buyer = await createTestUser();
      const product = await createTestProduct();

      // Older order
      const olderOrder = await createTestOrder({
        userId: buyer._id,
        productId: product._id,
        orderStatus: "delivered",
        paymentStatus: "paid",
        createdAt: new Date(Date.now() - 86400000) // 1 day ago
      });

      // Recent order
      const recentOrder = await createTestOrder({
        userId: buyer._id,
        productId: product._id,
        orderStatus: "delivered",
        paymentStatus: "paid",
        createdAt: new Date()
      });

      // Post review
      const response = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyer))
        .send({
          rating: 5,
          title: "Repeat buyer review",
          body: "Bought this item twice, outstanding quality."
        });

      expect(response.status).toBe(201);
      const reviewId = response.body.data.review._id;
      createdReviewIds.add(reviewId);

      const savedReview = await Review.findById(reviewId);
      expect(savedReview.order.toString()).toBe(recentOrder._id.toString());
      expect(savedReview.order.toString()).not.toBe(olderOrder._id.toString());

      // Update existing review -> remains the single review
      const updateResponse = await request(app)
        .patch(`/api/v1/products/${product._id}/reviews/${reviewId}`)
        .set("Authorization", getAuthHeader(buyer))
        .send({ rating: 4 });

      expect(updateResponse.status).toBe(200);

      const reviewCount = await Review.countDocuments({
        user: buyer._id,
        product: product._id
      });
      expect(reviewCount).toBe(1);
    });
  });

  // =========================================================================
  // 5. Rating Aggregation, Multiple Reviews & Precision
  // =========================================================================
  describe("Sections 11, 12, 26: Rating Aggregation & Mathematical Precision", () => {
    it("aggregates multiple reviews and accurately calculates 2-decimal precision (5, 4, 4 => 4.33)", async () => {
      const product = await createTestProduct();
      const buyer1 = await createTestUser({ name: "Buyer 1" });
      const buyer2 = await createTestUser({ name: "Buyer 2" });
      const buyer3 = await createTestUser({ name: "Buyer 3" });

      await createTestOrder({ userId: buyer1._id, productId: product._id });
      await createTestOrder({ userId: buyer2._id, productId: product._id });
      await createTestOrder({ userId: buyer3._id, productId: product._id });

      // Review 1: Rating 5
      const res1 = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyer1))
        .send({ rating: 5, body: "Review 1 body content." });
      expect(res1.status).toBe(201);
      createdReviewIds.add(res1.body.data.review._id);

      let pDoc = await Product.findById(product._id);
      expect(pDoc.ratingCount).toBe(1);
      expect(pDoc.ratingAverage).toBe(5);

      // Review 2: Rating 4 => (5 + 4) / 2 = 4.5
      const res2 = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyer2))
        .send({ rating: 4, body: "Review 2 body content." });
      expect(res2.status).toBe(201);
      createdReviewIds.add(res2.body.data.review._id);

      pDoc = await Product.findById(product._id);
      expect(pDoc.ratingCount).toBe(2);
      expect(pDoc.ratingAverage).toBe(4.5);

      // Review 3: Rating 4 => (5 + 4 + 4) / 3 = 13 / 3 = 4.3333... => 4.33
      const res3 = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyer3))
        .send({ rating: 4, body: "Review 3 body content." });
      expect(res3.status).toBe(201);
      createdReviewIds.add(res3.body.data.review._id);

      pDoc = await Product.findById(product._id);
      expect(pDoc.ratingCount).toBe(3);
      expect(pDoc.ratingAverage).toBe(4.33);
    });

    it("Section 26: Empty review state resets product ratingCount to 0 and ratingAverage to 0", async () => {
      const product = await createTestProduct({ ratingAverage: 4.5, ratingCount: 2 });
      // Recalculate with 0 published reviews
      const result = await recalculateProductRating(product._id);
      expect(result.ratingCount).toBe(0);
      expect(result.ratingAverage).toBe(0);

      const pDoc = await Product.findById(product._id);
      expect(pDoc.ratingCount).toBe(0);
      expect(pDoc.ratingAverage).toBe(0);
    });
  });

  // =========================================================================
  // 6. GET Reviews, Filtering, Moderation Exclusion & Public Projection Security
  // =========================================================================
  describe("Sections 13, 14, 15, 31: GET Integration, Moderation Exclusion & Security", () => {
    it("returns only published reviews, supports pagination and rating filtering", async () => {
      const product = await createTestProduct();
      const buyer1 = await createTestUser({ name: "Buyer 1" });
      const buyer2 = await createTestUser({ name: "Buyer 2" });
      const buyer3 = await createTestUser({ name: "Buyer 3" });

      const o1 = await createTestOrder({ userId: buyer1._id, productId: product._id });
      const o2 = await createTestOrder({ userId: buyer2._id, productId: product._id });
      const o3 = await createTestOrder({ userId: buyer3._id, productId: product._id });

      // Create 2 published reviews via API
      const r1 = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyer1))
        .send({ rating: 5, title: "Great", body: "Review five stars" });
      const r2 = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyer2))
        .send({ rating: 3, title: "Average", body: "Review three stars" });

      createdReviewIds.add(r1.body.data.review._id);
      createdReviewIds.add(r2.body.data.review._id);

      // Section 14: Create hidden review directly in DB
      const hiddenReview = await Review.create({
        product: product._id,
        user: buyer3._id,
        order: o3._id,
        rating: 1,
        title: "Hidden Review",
        body: "This review was hidden by moderation",
        isVerifiedBuyer: true,
        status: "hidden"
      });
      createdReviewIds.add(hiddenReview._id);

      // Section 15: Create flagged review directly in DB
      const flaggedBuyer = await createTestUser({ name: "Flagged Buyer" });
      const oFlagged = await createTestOrder({ userId: flaggedBuyer._id, productId: product._id });
      const flaggedReview = await Review.create({
        product: product._id,
        user: flaggedBuyer._id,
        order: oFlagged._id,
        rating: 1,
        title: "Flagged Review",
        body: "This review was flagged for review",
        isVerifiedBuyer: true,
        status: "flagged"
      });
      createdReviewIds.add(flaggedReview._id);

      // Call GET /api/v1/products/:productId/reviews
      const getRes = await request(app)
        .get(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyer1));

      expect(getRes.status).toBe(200);
      expect(getRes.body.success).toBe(true);
      expect(getRes.body.data.reviews).toHaveLength(2);
      expect(getRes.body.data.pagination.totalReviews).toBe(2);

      const returnedIds = getRes.body.data.reviews.map((r) => r._id.toString());
      expect(returnedIds).not.toContain(hiddenReview._id.toString());
      expect(returnedIds).not.toContain(flaggedReview._id.toString());

      // Filter by rating = 5
      const filterRes = await request(app)
        .get(`/api/v1/products/${product._id}/reviews?rating=5`)
        .set("Authorization", getAuthHeader(buyer1));

      expect(filterRes.status).toBe(200);
      expect(filterRes.body.data.reviews).toHaveLength(1);
      expect(filterRes.body.data.reviews[0].rating).toBe(5);

      // Pagination check: page=1, limit=1
      const pageRes = await request(app)
        .get(`/api/v1/products/${product._id}/reviews?page=1&limit=1`)
        .set("Authorization", getAuthHeader(buyer1));

      expect(pageRes.status).toBe(200);
      expect(pageRes.body.data.reviews).toHaveLength(1);
      expect(pageRes.body.data.pagination.totalPages).toBe(2);
      expect(pageRes.body.data.pagination.limit).toBe(1);

      // Section 31: Public Projection Security Verification
      const firstReview = getRes.body.data.reviews[0];
      expect(firstReview.order).toBeUndefined(); // Order ID not exposed
      expect(firstReview.user).toBeDefined();
      expect(firstReview.user.name).toBeDefined();
      expect(firstReview.user.email).toBeUndefined(); // Email not exposed
      expect(firstReview.user.password).toBeUndefined(); // Password not exposed
      expect(firstReview.user.role).toBeUndefined(); // Role not exposed
      expect(firstReview.user.phone).toBeUndefined(); // Phone not exposed
      expect(firstReview.user.addresses).toBeUndefined(); // Addresses not exposed
    });
  });

  // =========================================================================
  // 7. PATCH Review — Ownership & Product Scope Protection
  // =========================================================================
  describe("Sections 16, 17, 18: PATCH Review Integration & Security", () => {
    it("Section 16: Review author can update content/rating and updates product rating cache", async () => {
      const buyerA = await createTestUser({ name: "Buyer A" });
      const product = await createTestProduct();
      await createTestOrder({ userId: buyerA._id, productId: product._id });

      const postRes = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyerA))
        .send({ rating: 5, title: "Initial Title", body: "Initial review body" });

      const reviewId = postRes.body.data.review._id;
      createdReviewIds.add(reviewId);

      const patchRes = await request(app)
        .patch(`/api/v1/products/${product._id}/reviews/${reviewId}`)
        .set("Authorization", getAuthHeader(buyerA))
        .send({
          rating: 2,
          title: "Updated review",
          body: "The updated review body is valid."
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.review.rating).toBe(2);
      expect(patchRes.body.data.review.title).toBe("Updated review");
      expect(patchRes.body.data.review.body).toBe("The updated review body is valid.");

      // Check DB persistence & verify immutable fields did NOT change
      const updatedReview = await Review.findById(reviewId);
      expect(updatedReview.rating).toBe(2);
      expect(updatedReview.user.toString()).toBe(buyerA._id.toString());
      expect(updatedReview.product.toString()).toBe(product._id.toString());
      expect(updatedReview.isVerifiedBuyer).toBe(true);
      expect(updatedReview.status).toBe("published");
      expect(updatedReview.createdAt.toISOString()).toBe(postRes.body.data.review.createdAt);

      // Verify Product rating cache is recalculated to ratingAverage = 2
      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.ratingCount).toBe(1);
      expect(updatedProduct.ratingAverage).toBe(2);
    });

    it("Section 17: Buyer B cannot update Buyer A's review (403 REVIEW_ACCESS_DENIED)", async () => {
      const buyerA = await createTestUser({ name: "Buyer A" });
      const buyerB = await createTestUser({ name: "Buyer B" });
      const product = await createTestProduct();
      await createTestOrder({ userId: buyerA._id, productId: product._id });

      const postRes = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyerA))
        .send({ rating: 5, body: "Buyer A review body." });

      const reviewId = postRes.body.data.review._id;
      createdReviewIds.add(reviewId);

      // Buyer B tries to patch
      const patchRes = await request(app)
        .patch(`/api/v1/products/${product._id}/reviews/${reviewId}`)
        .set("Authorization", getAuthHeader(buyerB))
        .send({ rating: 1 });

      expect(patchRes.status).toBe(403);
      expect(patchRes.body.error.code).toBe("REVIEW_ACCESS_DENIED");

      // Verify review and product rating remain unchanged
      const reviewInDb = await Review.findById(reviewId);
      expect(reviewInDb.rating).toBe(5);
      const productInDb = await Product.findById(product._id);
      expect(productInDb.ratingAverage).toBe(5);
    });

    it("Section 18: PATCH rejected if review does not belong to specified productId (404 REVIEW_NOT_FOUND)", async () => {
      const buyerA = await createTestUser();
      const productA = await createTestProduct({ name: "Product A" });
      const productB = await createTestProduct({ name: "Product B" });
      await createTestOrder({ userId: buyerA._id, productId: productA._id });

      const postRes = await request(app)
        .post(`/api/v1/products/${productA._id}/reviews`)
        .set("Authorization", getAuthHeader(buyerA))
        .send({ rating: 5, body: "Buyer A review for Product A." });

      const reviewId = postRes.body.data.review._id;
      createdReviewIds.add(reviewId);

      // Attempt to patch review of Product A under Product B route
      const patchRes = await request(app)
        .patch(`/api/v1/products/${productB._id}/reviews/${reviewId}`)
        .set("Authorization", getAuthHeader(buyerA))
        .send({ rating: 2 });

      expect(patchRes.status).toBe(404);
      expect(patchRes.body.error.code).toBe("REVIEW_NOT_FOUND");

      // Verify ratings remain unchanged
      const pADoc = await Product.findById(productA._id);
      const pBDoc = await Product.findById(productB._id);
      expect(pADoc.ratingAverage).toBe(5);
      expect(pBDoc.ratingAverage).toBe(0);
    });
  });

  // =========================================================================
  // 8. DELETE Review — Ownership & Product Scope Protection
  // =========================================================================
  describe("Sections 19, 20: DELETE Review Integration & Ownership", () => {
    it("Section 20: Buyer B cannot delete Buyer A's review (403 REVIEW_ACCESS_DENIED)", async () => {
      const buyerA = await createTestUser({ name: "Buyer A" });
      const buyerB = await createTestUser({ name: "Buyer B" });
      const product = await createTestProduct();
      await createTestOrder({ userId: buyerA._id, productId: product._id });

      const postRes = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyerA))
        .send({ rating: 5, body: "Buyer A review body." });

      const reviewId = postRes.body.data.review._id;
      createdReviewIds.add(reviewId);

      const delRes = await request(app)
        .delete(`/api/v1/products/${product._id}/reviews/${reviewId}`)
        .set("Authorization", getAuthHeader(buyerB));

      expect(delRes.status).toBe(403);
      expect(delRes.body.error.code).toBe("REVIEW_ACCESS_DENIED");

      // Verify review still exists and rating unchanged
      const reviewInDb = await Review.findById(reviewId);
      expect(reviewInDb).toBeTruthy();
      const productInDb = await Product.findById(product._id);
      expect(productInDb.ratingCount).toBe(1);
    });

    it("Section 19: Author can delete review; removes from DB and resets Product rating to 0/0", async () => {
      const buyerA = await createTestUser();
      const product = await createTestProduct();
      await createTestOrder({ userId: buyerA._id, productId: product._id });

      const postRes = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyerA))
        .send({ rating: 5, body: "Review to be deleted." });

      const reviewId = postRes.body.data.review._id;

      const delRes = await request(app)
        .delete(`/api/v1/products/${product._id}/reviews/${reviewId}`)
        .set("Authorization", getAuthHeader(buyerA));

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify Review no longer exists in DB
      const reviewInDb = await Review.findById(reviewId);
      expect(reviewInDb).toBeNull();

      // Verify Product rating is reset to 0/0
      const productInDb = await Product.findById(product._id);
      expect(productInDb.ratingCount).toBe(0);
      expect(productInDb.ratingAverage).toBe(0);
    });

    it("DELETE rejected if review does not belong to specified productId (404 REVIEW_NOT_FOUND)", async () => {
      const buyerA = await createTestUser();
      const productA = await createTestProduct({ name: "Product A" });
      const productB = await createTestProduct({ name: "Product B" });
      await createTestOrder({ userId: buyerA._id, productId: productA._id });

      const postRes = await request(app)
        .post(`/api/v1/products/${productA._id}/reviews`)
        .set("Authorization", getAuthHeader(buyerA))
        .send({ rating: 5, body: "Buyer A review for Product A." });

      const reviewId = postRes.body.data.review._id;
      createdReviewIds.add(reviewId);

      const delRes = await request(app)
        .delete(`/api/v1/products/${productB._id}/reviews/${reviewId}`)
        .set("Authorization", getAuthHeader(buyerA));

      expect(delRes.status).toBe(404);
      expect(delRes.body.error.code).toBe("REVIEW_NOT_FOUND");
    });
  });

  // =========================================================================
  // 9. Product Rating Cache Recovery & Concurrency / Idempotency
  // =========================================================================
  describe("Sections 25, 33: Product Rating Cache Recovery & Idempotency", () => {
    it("Section 25: Recalculates product rating cache reliably when review status changes in DB", async () => {
      const buyer = await createTestUser();
      const product = await createTestProduct();
      await createTestOrder({ userId: buyer._id, productId: product._id });

      const postRes = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyer))
        .send({ rating: 5, body: "Review for cache recovery test." });

      const reviewId = postRes.body.data.review._id;
      createdReviewIds.add(reviewId);

      // Hide review directly in DB
      await Review.findByIdAndUpdate(reviewId, { status: "hidden" });

      // Trigger recalculation
      await recalculateProductRating(product._id);
      let pDoc = await Product.findById(product._id);
      expect(pDoc.ratingCount).toBe(0);
      expect(pDoc.ratingAverage).toBe(0);

      // Restore review to published directly in DB
      await Review.findByIdAndUpdate(reviewId, { status: "published" });

      // Trigger recalculation
      await recalculateProductRating(product._id);
      pDoc = await Product.findById(product._id);
      expect(pDoc.ratingCount).toBe(1);
      expect(pDoc.ratingAverage).toBe(5);
    });

    it("Section 33: Concurrent and repeated recalculations yield deterministic identical state", async () => {
      const product = await createTestProduct();
      const buyer1 = await createTestUser();
      const buyer2 = await createTestUser();
      await createTestOrder({ userId: buyer1._id, productId: product._id });
      await createTestOrder({ userId: buyer2._id, productId: product._id });

      const r1 = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyer1))
        .send({ rating: 5, body: "Review 1 body content." });
      const r2 = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyer2))
        .send({ rating: 3, body: "Review 2 body content." });

      createdReviewIds.add(r1.body.data.review._id);
      createdReviewIds.add(r2.body.data.review._id);

      // Concurrent recalculation execution
      const [res1, res2] = await Promise.all([
        recalculateProductRating(product._id),
        recalculateProductRating(product._id)
      ]);

      expect(res1.ratingAverage).toBe(4);
      expect(res1.ratingCount).toBe(2);
      expect(res2.ratingAverage).toBe(4);
      expect(res2.ratingCount).toBe(2);

      const pDoc = await Product.findById(product._id);
      expect(pDoc.ratingAverage).toBe(4);
      expect(pDoc.ratingCount).toBe(2);
    });
  });

  // =========================================================================
  // 10. Nonexistent Products, Malformed IDs, Validation & Route Regression
  // =========================================================================
  describe("Sections 27, 28, 30, 34: Edge Cases, Validation & Route Regression", () => {
    it("Section 27: POST to nonexistent product ID returns 404 PRODUCT_NOT_FOUND", async () => {
      const buyer = await createTestUser();
      const nonExistentProductId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .post(`/api/v1/products/${nonExistentProductId}/reviews`)
        .set("Authorization", getAuthHeader(buyer))
        .send({ rating: 5, body: "Nonexistent product test body." });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("PRODUCT_NOT_FOUND");
    });

    it("Section 27: GET to nonexistent product ID returns 404 PRODUCT_NOT_FOUND", async () => {
      const buyer = await createTestUser();
      const nonExistentProductId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .get(`/api/v1/products/${nonExistentProductId}/reviews`)
        .set("Authorization", getAuthHeader(buyer));

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("PRODUCT_NOT_FOUND");
    });

    it("Section 28: Malformed productId rejected with 400 VALIDATION_ERROR before database query", async () => {
      const buyer = await createTestUser();

      const response = await request(app)
        .post("/api/v1/products/not-a-valid-id/reviews")
        .set("Authorization", getAuthHeader(buyer))
        .send({ rating: 5, body: "Malformed ID test." });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("Section 28: Malformed reviewId rejected with 400 VALIDATION_ERROR", async () => {
      const buyer = await createTestUser();
      const product = await createTestProduct();

      const response = await request(app)
        .patch(`/api/v1/products/${product._id}/reviews/bad-review-id`)
        .set("Authorization", getAuthHeader(buyer))
        .send({ rating: 4 });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("Section 30: Invalid rating values (0, 6, 1.5, '5') rejected with 400 VALIDATION_ERROR", async () => {
      const buyer = await createTestUser();
      const product = await createTestProduct();

      for (const invalidRating of [0, 6, 1.5, "5"]) {
        const response = await request(app)
          .post(`/api/v1/products/${product._id}/reviews`)
          .set("Authorization", getAuthHeader(buyer))
          .send({ rating: invalidRating, body: "Testing invalid rating values." });

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe("VALIDATION_ERROR");
      }
    });

    it("Section 30: Invalid review body (missing, too short, too long) rejected with 400 VALIDATION_ERROR", async () => {
      const buyer = await createTestUser();
      const product = await createTestProduct();

      // Missing body
      const res1 = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyer))
        .send({ rating: 5 });
      expect(res1.status).toBe(400);

      // Too short (< 5 chars)
      const res2 = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyer))
        .send({ rating: 5, body: "tiny" });
      expect(res2.status).toBe(400);

      // Too long (> 2000 chars)
      const res3 = await request(app)
        .post(`/api/v1/products/${product._id}/reviews`)
        .set("Authorization", getAuthHeader(buyer))
        .send({ rating: 5, body: "a".repeat(2001) });
      expect(res3.status).toBe(400);
    });

    it("Section 34: Existing Product routes still operate without router interference", async () => {
      const product = await createTestProduct({ name: "Basecamp Stove" });

      // GET /api/v1/products/:id
      const getSingleRes = await request(app)
        .get(`/api/v1/products/${product._id}`);

      expect(getSingleRes.status).toBe(200);
      expect(getSingleRes.body.success).toBe(true);
      expect(getSingleRes.body.data.product.name).toBe("Basecamp Stove");

      // GET /api/v1/products
      const getAllRes = await request(app)
        .get("/api/v1/products");

      expect(getAllRes.status).toBe(200);
      expect(getAllRes.body.success).toBe(true);
      expect(Array.isArray(getAllRes.body.data.products)).toBe(true);
    });
  });
});
