import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../../app.js";
import User from "../users/user.model.js";
import AdminAuditLog from "./admin-audit-log.model.js";
import generateToken from "../../utils/generate-token.js";
import { AUTH_COOKIE_NAME } from "../../config/cookie.js";
import { authRateLimitMiddleware } from "../../common/middleware/auth-rate-limit.middleware.js";
import {
  AUDIT_EVENT_TYPES,
  sanitizeAuditMetadata,
  recordAdminAuditEvent,
  isSensitiveKey,
  sanitizeStringValue
} from "./admin-audit.service.js";
import Product from "../products/product.model.js";
import Order from "../orders/order.model.js";
import InventoryAdjustment from "../inventory/inventory-adjustment.model.js";

describe("Production Administrative Audit Logging & Read API Tests", () => {
  let app;
  const adminId1 = "507f1f77bcf86cd799439001";
  const adminId2 = "507f1f77bcf86cd799439002";
  const customerId = "507f1f77bcf86cd799439003";

  let adminToken1;
  let customerToken;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();

    authRateLimitMiddleware.resetKey("::ffff:127.0.0.1");
    authRateLimitMiddleware.resetKey("127.0.0.1");
    authRateLimitMiddleware.resetKey("::1");

    adminToken1 = generateToken({
      userId: adminId1,
      email: "admin1@example.com",
      role: "admin"
    });

    customerToken = generateToken({
      userId: customerId,
      email: "customer@example.com",
      role: "customer"
    });
  });

  describe("1-3. Authentication & Authorization Gateways for Audit Logs", () => {
    it("1. unauthenticated audit read -> 401 AUTH_TOKEN_REQUIRED", async () => {
      const res = await request(app).get("/api/v1/admin/audit-logs");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });

    it("2. customer audit read -> 403 FORBIDDEN", async () => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: customerId,
        email: "customer@example.com",
        role: "customer",
        isActive: true
      });

      const res = await request(app)
        .get("/api/v1/admin/audit-logs")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("3. admin audit read -> 200 OK", async () => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: adminId1,
        email: "admin1@example.com",
        role: "admin",
        isActive: true
      });

      vi.spyOn(AdminAuditLog, "countDocuments").mockResolvedValue(0);
      vi.spyOn(AdminAuditLog, "find").mockReturnValue({
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      });

      const res = await request(app)
        .get("/api/v1/admin/audit-logs")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.auditLogs).toEqual([]);
      expect(res.body.data.pagination.page).toBe(1);
    });
  });

  describe("4-8. Pagination, Bounding, Deterministic Sorting & Filters", () => {
    beforeEach(() => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: adminId1,
        email: "admin1@example.com",
        role: "admin",
        isActive: true
      });
    });

    it("4. audit pagination is bounded to maximum 50", async () => {
      let capturedLimit = null;
      vi.spyOn(AdminAuditLog, "countDocuments").mockResolvedValue(100);
      vi.spyOn(AdminAuditLog, "find").mockReturnValue({
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation((lim) => {
          capturedLimit = lim;
          return {
            lean: vi.fn().mockResolvedValue([])
          };
        })
      });

      // Request limit > 50 should be rejected by Zod validation
      const res = await request(app)
        .get("/api/v1/admin/audit-logs?limit=100")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("5. deterministic sorting uses newest first with _id tie breaker", async () => {
      let capturedSort = null;
      vi.spyOn(AdminAuditLog, "countDocuments").mockResolvedValue(0);
      vi.spyOn(AdminAuditLog, "find").mockReturnValue({
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockImplementation((sortObj) => {
          capturedSort = sortObj;
          return {
            skip: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue([])
          };
        })
      });

      const res = await request(app)
        .get("/api/v1/admin/audit-logs")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`);

      expect(res.status).toBe(200);
      expect(capturedSort).toEqual({ createdAt: -1, _id: -1 });
    });

    it("6. eventType filter correctly applies to query", async () => {
      let capturedFilter = null;
      vi.spyOn(AdminAuditLog, "countDocuments").mockImplementation((flt) => {
        capturedFilter = flt;
        return Promise.resolve(1);
      });
      vi.spyOn(AdminAuditLog, "find").mockImplementation((flt) => {
        capturedFilter = flt;
        return {
          select: vi.fn().mockReturnThis(),
          sort: vi.fn().mockReturnThis(),
          skip: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          lean: vi.fn().mockResolvedValue([
            {
              _id: "607f1f77bcf86cd799439001",
              eventType: AUDIT_EVENT_TYPES.ADMIN_USER_CREATED,
              actorUserId: adminId1,
              actorEmail: "admin1@example.com",
              actorRole: "admin",
              targetUserId: adminId2,
              targetEmail: "admin2@example.com",
              metadata: { role: "admin" },
              ipAddress: "127.0.0.1",
              userAgent: "vitest-agent",
              createdAt: new Date()
            }
          ])
        };
      });

      const res = await request(app)
        .get(`/api/v1/admin/audit-logs?eventType=${AUDIT_EVENT_TYPES.ADMIN_USER_CREATED}`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`);

      expect(res.status).toBe(200);
      expect(capturedFilter.eventType).toBe(AUDIT_EVENT_TYPES.ADMIN_USER_CREATED);
      expect(res.body.data.auditLogs.length).toBe(1);
    });

    it("7. actorUserId filter correctly applies to query", async () => {
      let capturedFilter = null;
      vi.spyOn(AdminAuditLog, "countDocuments").mockImplementation((flt) => {
        capturedFilter = flt;
        return Promise.resolve(0);
      });
      vi.spyOn(AdminAuditLog, "find").mockReturnValue({
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      });

      const res = await request(app)
        .get(`/api/v1/admin/audit-logs?actorUserId=${adminId1}`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`);

      expect(res.status).toBe(200);
      expect(capturedFilter.actorUserId).toBe(adminId1);
    });

    it("8. targetUserId filter correctly applies to query", async () => {
      let capturedFilter = null;
      vi.spyOn(AdminAuditLog, "countDocuments").mockImplementation((flt) => {
        capturedFilter = flt;
        return Promise.resolve(0);
      });
      vi.spyOn(AdminAuditLog, "find").mockReturnValue({
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      });

      const res = await request(app)
        .get(`/api/v1/admin/audit-logs?targetUserId=${adminId2}`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`);

      expect(res.status).toBe(200);
      expect(capturedFilter.targetUserId).toBe(adminId2);
    });
  });

  describe("9-12. Business Mutation Triggers & Rejection Isolation", () => {
    beforeEach(() => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: adminId1,
        email: "admin1@example.com",
        role: "admin",
        isActive: true
      });
    });

    it("9. successful admin creation creates audit event with authoritative actor", async () => {
      let createdAuditPayload = null;
      vi.spyOn(User, "findOne").mockResolvedValue(null);
      vi.spyOn(bcrypt, "hash").mockResolvedValue("hashedPassword123");
      vi.spyOn(User, "create").mockResolvedValue({
        _id: adminId2,
        name: "Second Admin",
        email: "admin2@example.com",
        role: "admin",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      vi.spyOn(AdminAuditLog, "create").mockImplementation(async (payload) => {
        createdAuditPayload = payload;
        return { _id: "607f1f77bcf86cd799439099", ...payload };
      });

      const res = await request(app)
        .post("/api/v1/admin/users")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({
          name: "Second Admin",
          email: "admin2@example.com",
          password: "SecurePassword123!",
          actorId: "fake-spoofed-actor", // attempt to spoof
          actorRole: "superadmin"
        });

      expect(res.status).toBe(201);
      expect(createdAuditPayload).not.toBeNull();
      expect(createdAuditPayload.eventType).toBe(AUDIT_EVENT_TYPES.ADMIN_USER_CREATED);
      // Strictly req.user, not fake client-supplied actor
      expect(createdAuditPayload.actorUserId.toString()).toBe(adminId1);
      expect(createdAuditPayload.actorEmail).toBe("admin1@example.com");
      expect(createdAuditPayload.actorRole).toBe("admin");
      expect(createdAuditPayload.targetUserId.toString()).toBe(adminId2);
      expect(createdAuditPayload.targetEmail).toBe("admin2@example.com");
    });

    it("10. successful status update creates audit event", async () => {
      let createdAuditPayload = null;
      const targetUser = {
        _id: adminId2,
        name: "Second Admin",
        email: "admin2@example.com",
        role: "admin",
        isActive: true,
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(User, "findById").mockImplementation(async (id) => {
        if (id === adminId1) {
          return { _id: adminId1, email: "admin1@example.com", role: "admin", isActive: true };
        }
        return targetUser;
      });
      vi.spyOn(User, "countDocuments").mockResolvedValue(3); // 3 active admins

      vi.spyOn(AdminAuditLog, "create").mockImplementation(async (payload) => {
        createdAuditPayload = payload;
        return { _id: "607f1f77bcf86cd799439098", ...payload };
      });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${adminId2}/status`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({ isActive: false });

      expect(res.status).toBe(200);
      expect(createdAuditPayload).not.toBeNull();
      expect(createdAuditPayload.eventType).toBe(AUDIT_EVENT_TYPES.ADMIN_USER_STATUS_UPDATED);
      expect(createdAuditPayload.metadata.previousStatus).toBe("active");
      expect(createdAuditPayload.metadata.newStatus).toBe("inactive");
    });

    it("11. successful role update creates audit event", async () => {
      let createdAuditPayload = null;
      const targetUser = {
        _id: customerId,
        name: "Target Customer",
        email: "customer@example.com",
        role: "customer",
        isActive: true,
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(User, "findById").mockImplementation(async (id) => {
        if (id === adminId1) {
          return { _id: adminId1, email: "admin1@example.com", role: "admin", isActive: true };
        }
        return targetUser;
      });

      vi.spyOn(AdminAuditLog, "create").mockImplementation(async (payload) => {
        createdAuditPayload = payload;
        return { _id: "607f1f77bcf86cd799439097", ...payload };
      });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${customerId}/role`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({ role: "admin" });

      expect(res.status).toBe(200);
      expect(createdAuditPayload).not.toBeNull();
      expect(createdAuditPayload.eventType).toBe(AUDIT_EVENT_TYPES.ADMIN_USER_ROLE_UPDATED);
      expect(createdAuditPayload.metadata.previousRole).toBe("customer");
      expect(createdAuditPayload.metadata.newRole).toBe("admin");
    });

    it("12. rejected mutation creates NO audit event", async () => {
      const auditCreateSpy = vi.spyOn(AdminAuditLog, "create");

      // Case A: Duplicate email rejection
      vi.spyOn(User, "findOne").mockResolvedValue({ _id: "existingId" });

      const res1 = await request(app)
        .post("/api/v1/admin/users")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({
          name: "Duplicate User",
          email: "duplicate@example.com",
          password: "SecurePassword123!"
        });

      expect(res1.status).toBe(409);
      expect(auditCreateSpy).not.toHaveBeenCalled();

      // Case B: Self-demotion rejection
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: adminId1,
        email: "admin1@example.com",
        role: "admin",
        isActive: true
      });
      vi.spyOn(User, "countDocuments").mockResolvedValue(2);

      const res2 = await request(app)
        .patch(`/api/v1/admin/users/${adminId1}/role`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({ role: "customer" });

      expect(res2.status).toBe(400);
      expect(auditCreateSpy).not.toHaveBeenCalled();
    });
  });

  describe("13-19. Actor Non-Spoofability & Credential Redaction", () => {
    it("13-15. actor identity is derived from req.user and cannot be spoofed by client payload", async () => {
      let persistedPayload = null;
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: adminId1,
        email: "admin1@example.com",
        role: "admin",
        isActive: true
      });
      vi.spyOn(User, "findOne").mockResolvedValue(null);
      vi.spyOn(User, "create").mockResolvedValue({
        _id: adminId2,
        name: "Created Admin",
        email: "created@example.com",
        role: "admin",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      vi.spyOn(AdminAuditLog, "create").mockImplementation(async (payload) => {
        persistedPayload = payload;
        return { _id: "607f1f77bcf86cd799439096", ...payload };
      });

      const res = await request(app)
        .post("/api/v1/admin/users")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({
          name: "Created Admin",
          email: "created@example.com",
          password: "SecurePassword123!",
          actorUserId: "malicious-user-id",
          actorEmail: "spoofed@victim.com",
          actorRole: "superadmin"
        });

      expect(res.status).toBe(201);
      expect(persistedPayload.actorUserId.toString()).toBe(adminId1);
      expect(persistedPayload.actorEmail).toBe("admin1@example.com");
      expect(persistedPayload.actorRole).toBe("admin");
    });

    it("16-19. sanitizeAuditMetadata strips passwords, hashes, tokens, cookies, secrets", () => {
      const sensitiveInput = {
        role: "admin",
        password: "PlaintextPassword!",
        passwordHash: "$2a$12$e0VRH7x0J6W7z.mockHash",
        jwtToken: "eyJhbGciOiJIUzI1NiIsIn...",
        authToken: "auth_token_value",
        auth_cookie: "cookie_value",
        secretApiKey: "secret_12345",
        nested: {
          refreshToken: "refresh_val",
          safeField: "safeValue"
        }
      };

      const sanitized = sanitizeAuditMetadata(sensitiveInput);

      expect(sanitized.role).toBe("admin");
      expect(sanitized.password).toBeUndefined();
      expect(sanitized.passwordHash).toBeUndefined();
      expect(sanitized.jwtToken).toBeUndefined();
      expect(sanitized.authToken).toBeUndefined();
      expect(sanitized.auth_cookie).toBeUndefined();
      expect(sanitized.secretApiKey).toBeUndefined();
      expect(sanitized.nested.refreshToken).toBeUndefined();
      expect(sanitized.nested.safeField).toBe("safeValue");
    });

    it("16a. sanitizeAuditMetadata strips all sensitive key families across separators and casing", () => {
      const input = {
        // Safe operational metadata that must be preserved
        orderId: "607f1f77bcf86cd799439011",
        refundNumber: "RFND-20261010-001",
        returnNumber: "RET-20261010-001",
        idempotencyKey: "ledger:refund-requested:123",
        amount: 2500,
        currency: "INR",
        status: "succeeded",
        previousStatus: "pending",
        newStatus: "succeeded",
        rejectionReason: "Customer requested exchange",
        shippingAddress: { city: "Bengaluru", state: "Karnataka" },

        // Sensitive key families with camelCase, snake_case, kebab-case, and uppercase
        password: "p1",
        password_hash: "h1",
        passwordHash: "h2",
        hash: "h3",
        token: "t1",
        access_token: "t2",
        accessToken: "t3",
        refreshToken: "t4",
        "refresh-token": "t5",
        secret: "s1",
        clientSecret: "s2",
        client_secret: "s3",
        apiKey: "k1",
        api_key: "k2",
        "api-key": "k3",
        API_KEY: "k4",
        authorization: "a1",
        auth: "a2",
        cookie: "c1",
        "set-cookie": "c2",
        set_cookie: "c3",
        signature: "sig1",
        webhook_signature: "sig2",
        card: "card1",
        creditCard: "card2",
        credit_card: "card3",
        cvv: "123",
        cvc: "456",
        paymentMethod: "card",
        payment_method: "upi",
        paymentInstrument: "wallet",
        accountNumber: "987654321",
        account_number: "987654321",
        bankAccount: "HDFC0001",
        routingNumber: "123456",
        pin: "9999",
        user_pin: "8888",
        cardPin: "7777",
        ssn: "000-00-0000",
        customer_ssn: "111-11-1111",
        pan: "ABCDE1234F",
        privateKey: "pk1",
        private_key: "pk2",
        salt: "salt123"
      };

      const sanitized = sanitizeAuditMetadata(input);

      // Safe fields MUST be preserved
      expect(sanitized.orderId).toBe("607f1f77bcf86cd799439011");
      expect(sanitized.refundNumber).toBe("RFND-20261010-001");
      expect(sanitized.returnNumber).toBe("RET-20261010-001");
      expect(sanitized.idempotencyKey).toBe("ledger:refund-requested:123");
      expect(sanitized.amount).toBe(2500);
      expect(sanitized.currency).toBe("INR");
      expect(sanitized.status).toBe("succeeded");
      expect(sanitized.previousStatus).toBe("pending");
      expect(sanitized.newStatus).toBe("succeeded");
      expect(sanitized.rejectionReason).toBe("Customer requested exchange");
      expect(sanitized.shippingAddress).toEqual({ city: "Bengaluru", state: "Karnataka" });

      // All sensitive fields MUST be undefined
      expect(sanitized.password).toBeUndefined();
      expect(sanitized.password_hash).toBeUndefined();
      expect(sanitized.passwordHash).toBeUndefined();
      expect(sanitized.hash).toBeUndefined();
      expect(sanitized.token).toBeUndefined();
      expect(sanitized.access_token).toBeUndefined();
      expect(sanitized.accessToken).toBeUndefined();
      expect(sanitized.refreshToken).toBeUndefined();
      expect(sanitized["refresh-token"]).toBeUndefined();
      expect(sanitized.secret).toBeUndefined();
      expect(sanitized.clientSecret).toBeUndefined();
      expect(sanitized.client_secret).toBeUndefined();
      expect(sanitized.apiKey).toBeUndefined();
      expect(sanitized.api_key).toBeUndefined();
      expect(sanitized["api-key"]).toBeUndefined();
      expect(sanitized.API_KEY).toBeUndefined();
      expect(sanitized.authorization).toBeUndefined();
      expect(sanitized.auth).toBeUndefined();
      expect(sanitized.cookie).toBeUndefined();
      expect(sanitized["set-cookie"]).toBeUndefined();
      expect(sanitized.set_cookie).toBeUndefined();
      expect(sanitized.signature).toBeUndefined();
      expect(sanitized.webhook_signature).toBeUndefined();
      expect(sanitized.card).toBeUndefined();
      expect(sanitized.creditCard).toBeUndefined();
      expect(sanitized.credit_card).toBeUndefined();
      expect(sanitized.cvv).toBeUndefined();
      expect(sanitized.cvc).toBeUndefined();
      expect(sanitized.paymentMethod).toBeUndefined();
      expect(sanitized.payment_method).toBeUndefined();
      expect(sanitized.paymentInstrument).toBeUndefined();
      expect(sanitized.accountNumber).toBeUndefined();
      expect(sanitized.account_number).toBeUndefined();
      expect(sanitized.bankAccount).toBeUndefined();
      expect(sanitized.routingNumber).toBeUndefined();
      expect(sanitized.pin).toBeUndefined();
      expect(sanitized.user_pin).toBeUndefined();
      expect(sanitized.cardPin).toBeUndefined();
      expect(sanitized.ssn).toBeUndefined();
      expect(sanitized.customer_ssn).toBeUndefined();
      expect(sanitized.pan).toBeUndefined();
      expect(sanitized.privateKey).toBeUndefined();
      expect(sanitized.private_key).toBeUndefined();
      expect(sanitized.salt).toBeUndefined();
    });

    it("16b. sanitizeAuditMetadata handles deeply nested structures and arrays without data leakage", () => {
      const complexInput = {
        level1: {
          safeL1: "value1",
          level2: {
            safeL2: "value2",
            apiKey: "nested_api_key_secret",
            level3: {
              items: [
                { safeItem: "item1", clientSecret: "nested_secret_in_array" },
                { safeItem: "item2", pin: "1234" }
              ],
              userPin: "deep_pin"
            }
          }
        }
      };

      const sanitized = sanitizeAuditMetadata(complexInput);

      expect(sanitized.level1.safeL1).toBe("value1");
      expect(sanitized.level1.level2.safeL2).toBe("value2");
      expect(sanitized.level1.level2.apiKey).toBeUndefined();
      expect(sanitized.level1.level2.level3.items[0].safeItem).toBe("item1");
      expect(sanitized.level1.level2.level3.items[0].clientSecret).toBeUndefined();
      expect(sanitized.level1.level2.level3.items[1].safeItem).toBe("item2");
      expect(sanitized.level1.level2.level3.items[1].pin).toBeUndefined();
      expect(sanitized.level1.level2.level3.userPin).toBeUndefined();
    });

    it("16c. sanitizeAuditMetadata sanitizes risky free-text and drops raw stack traces and request blobs", () => {
      const freeTextInput = {
        failureReason: "Payment gateway error: Bearer eyJhbGciOiJIUzI1NiJ9.test and rzp_test_999ABC for card 4111222233334444",
        errorDetails: new Error("Database timeout at connection pool"),
        stack: "Error: trace at internal/process/task_queues:95:5",
        rawBody: '{"password":"123","apiKey":"secret"}',
        headers: { authorization: "Bearer topsecret" }
      };

      const sanitized = sanitizeAuditMetadata(freeTextInput);

      // Embedded secrets inside free-text are redacted
      expect(sanitized.failureReason).toContain("Bearer [REDACTED]");
      expect(sanitized.failureReason).toContain("[REDACTED_KEY]");
      expect(sanitized.failureReason).toContain("[REDACTED_CARD]");
      expect(sanitized.failureReason).not.toContain("4111222233334444");
      expect(sanitized.failureReason).not.toContain("rzp_test_999ABC");

      // Error object is safely converted without raw stack
      expect(sanitized.errorDetails.name).toBe("Error");
      expect(sanitized.errorDetails.message).toBe("Database timeout at connection pool");
      expect(sanitized.errorDetails.stack).toBeUndefined();

      // Risky blob keys are completely dropped
      expect(sanitized.stack).toBeUndefined();
      expect(sanitized.rawBody).toBeUndefined();
      expect(sanitized.headers).toBeUndefined();
    });

    it("16d. recordAdminAuditEvent sanitizes metadata before persistence", async () => {
      let capturedPayload = null;
      vi.spyOn(AdminAuditLog, "create").mockImplementation(async (payload) => {
        capturedPayload = payload;
        return { _id: "607f1f77bcf86cd799439099", ...payload };
      });

      const mockAdminUser = {
        _id: adminId1,
        email: "admin1@example.com",
        role: "admin"
      };

      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.REFUND_FAILED,
        metadata: {
          refundId: "607f1f77bcf86cd799439088",
          refundNumber: "RFND-20261010-0099",
          clientSecret: "rzp_secret_top_confidential",
          apiKey: "rzp_test_public_key",
          failureReason: "Gateway failed with auth token Bearer secret_session_token_123"
        },
        req: { user: mockAdminUser }
      });

      expect(capturedPayload).not.toBeNull();
      expect(capturedPayload.metadata.refundId).toBe("607f1f77bcf86cd799439088");
      expect(capturedPayload.metadata.refundNumber).toBe("RFND-20261010-0099");
      expect(capturedPayload.metadata.clientSecret).toBeUndefined();
      expect(capturedPayload.metadata.apiKey).toBeUndefined();
      expect(capturedPayload.metadata.failureReason).toContain("Bearer [REDACTED]");
      expect(capturedPayload.metadata.failureReason).not.toContain("secret_session_token_123");
    });

    it("16e. GET /api/v1/admin/audit-logs redacts unsafe metadata from legacy database records on read", async () => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: adminId1,
        email: "admin1@example.com",
        role: "admin",
        isActive: true
      });

      const legacyUnsanitizedDoc = {
        _id: "607f1f77bcf86cd799439088",
        eventType: AUDIT_EVENT_TYPES.REFUND_SUCCEEDED,
        actorUserId: adminId1,
        actorEmail: "admin1@example.com",
        actorRole: "admin",
        targetUserId: customerId,
        targetEmail: "customer@example.com",
        resourceType: "refund",
        resourceId: "rfnd_123",
        // Legacy document contains pre-existing unsanitized keys in MongoDB
        metadata: {
          orderId: "607f1f77bcf86cd799439003",
          refundNumber: "RFND-LEGACY-001",
          password: "legacy_stored_password",
          clientSecret: "legacy_stored_secret",
          apiKey: "legacy_stored_api_key",
          paymentMethod: "card_legacy_vault",
          failureReason: "Legacy log Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token"
        },
        ipAddress: "127.0.0.1",
        userAgent: "TestAgent",
        createdAt: new Date()
      };

      vi.spyOn(AdminAuditLog, "countDocuments").mockResolvedValue(1);
      vi.spyOn(AdminAuditLog, "find").mockReturnValue({
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([legacyUnsanitizedDoc])
      });

      const res = await request(app)
        .get("/api/v1/admin/audit-logs")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.auditLogs).toHaveLength(1);

      const returnedMeta = res.body.data.auditLogs[0].metadata;

      // Safe fields are present
      expect(returnedMeta.orderId).toBe("607f1f77bcf86cd799439003");
      expect(returnedMeta.refundNumber).toBe("RFND-LEGACY-001");

      // Legacy sensitive keys are stripped by read-side sanitizer
      expect(returnedMeta.password).toBeUndefined();
      expect(returnedMeta.clientSecret).toBeUndefined();
      expect(returnedMeta.apiKey).toBeUndefined();
      expect(returnedMeta.paymentMethod).toBeUndefined();

      // Free-text in legacy record is sanitized
      expect(returnedMeta.failureReason).toContain("Bearer [REDACTED]");
      expect(returnedMeta.failureReason).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    });
  });

  describe("20-24. Immutability & Projection Safety", () => {
    beforeEach(() => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: adminId1,
        email: "admin1@example.com",
        role: "admin",
        isActive: true
      });
      vi.spyOn(AdminAuditLog, "countDocuments").mockResolvedValue(0);
      vi.spyOn(AdminAuditLog, "find").mockReturnValue({
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      });
    });

    it("20. audit events are strictly immutable through HTTP API (POST, PUT, PATCH, DELETE -> 405)", async () => {
      const resPost = await request(app)
        .post("/api/v1/admin/audit-logs")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({ eventType: "FAKE_EVENT" });
      expect(resPost.status).toBe(405);
      expect(resPost.body.error.code).toBe("METHOD_NOT_ALLOWED");

      const resPatch = await request(app)
        .patch("/api/v1/admin/audit-logs/607f1f77bcf86cd799439001")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({ eventType: "MODIFIED" });
      expect(resPatch.status).toBe(405);
      expect(resPatch.body.error.code).toBe("METHOD_NOT_ALLOWED");

      const resDelete = await request(app)
        .delete("/api/v1/admin/audit-logs/607f1f77bcf86cd799439001")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`);
      expect(resDelete.status).toBe(405);
      expect(resDelete.body.error.code).toBe("METHOD_NOT_ALLOWED");
    });

    it("21. malicious query operators are rejected by validator", async () => {
      // Malicious query with nested object injection
      const res = await request(app)
        .get("/api/v1/admin/audit-logs?actorUserId[$ne]=null")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`);

      // Should be rejected by Zod schema validation
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("24. audit response projection contains only approved safe fields", async () => {
      vi.spyOn(AdminAuditLog, "countDocuments").mockResolvedValue(1);
      vi.spyOn(AdminAuditLog, "find").mockReturnValue({
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([
          {
            _id: "607f1f77bcf86cd799439001",
            eventType: AUDIT_EVENT_TYPES.ADMIN_USER_CREATED,
            actorUserId: adminId1,
            actorEmail: "admin1@example.com",
            actorRole: "admin",
            targetUserId: adminId2,
            targetEmail: "admin2@example.com",
            metadata: { role: "admin" },
            ipAddress: "127.0.0.1",
            userAgent: "Mozilla/5.0",
            createdAt: new Date()
          }
        ])
      });

      const res = await request(app)
        .get("/api/v1/admin/audit-logs")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`);

      expect(res.status).toBe(200);
      const log = res.body.data.auditLogs[0];
      expect(log).toHaveProperty("id");
      expect(log).toHaveProperty("eventType");
      expect(log).toHaveProperty("actorUserId");
      expect(log).toHaveProperty("actorEmail");
      expect(log).toHaveProperty("actorRole");
      expect(log).toHaveProperty("targetUserId");
      expect(log).toHaveProperty("targetEmail");
      expect(log).toHaveProperty("metadata");
      expect(log).toHaveProperty("ipAddress");
      expect(log).toHaveProperty("userAgent");
      expect(log).toHaveProperty("createdAt");

      // Verify no sensitive internal fields leaked
      expect(log).not.toHaveProperty("password");
      expect(log).not.toHaveProperty("hash");
      expect(log).not.toHaveProperty("token");
    });
  });

  describe("25-30. Extended Administrative Audit Coverage (Products, Inventory, Orders, Customers & Resource Query)", () => {
    beforeEach(() => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: adminId1,
        email: "admin1@example.com",
        role: "admin",
        isActive: true
      });
    });

    it("25. resourceType and resourceId filters correctly apply to query", async () => {
      let capturedFilter = null;
      vi.spyOn(AdminAuditLog, "countDocuments").mockImplementation((flt) => {
        capturedFilter = flt;
        return Promise.resolve(1);
      });
      vi.spyOn(AdminAuditLog, "find").mockImplementation((flt) => {
        capturedFilter = flt;
        return {
          select: vi.fn().mockReturnThis(),
          sort: vi.fn().mockReturnThis(),
          skip: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          lean: vi.fn().mockResolvedValue([
            {
              _id: "607f1f77bcf86cd799439001",
              eventType: AUDIT_EVENT_TYPES.PRODUCT_CREATED,
              actorUserId: adminId1,
              actorEmail: "admin1@example.com",
              actorRole: "admin",
              resourceType: "product",
              resourceId: "507f1f77bcf86cd799439010",
              metadata: { name: "Test Tent" },
              ipAddress: "127.0.0.1",
              userAgent: "vitest",
              createdAt: new Date()
            }
          ])
        };
      });

      const res = await request(app)
        .get("/api/v1/admin/audit-logs?resourceType=product&resourceId=507f1f77bcf86cd799439010")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`);

      expect(res.status).toBe(200);
      expect(capturedFilter.resourceType).toBe("product");
      expect(capturedFilter.resourceId).toBe("507f1f77bcf86cd799439010");
      expect(res.body.data.auditLogs[0].resourceType).toBe("product");
      expect(res.body.data.auditLogs[0].resourceId).toBe("507f1f77bcf86cd799439010");
    });

    it("26. recordAdminAuditEvent persists resourceType, resourceId, and metadata", async () => {
      let createdPayload = null;
      vi.spyOn(AdminAuditLog, "create").mockImplementation(async (payload) => {
        createdPayload = payload;
        return { _id: "607f1f77bcf86cd799439055", ...payload };
      });

      const fakeReq = {
        user: { _id: adminId1, email: "admin1@example.com", role: "admin" },
        ip: "10.0.0.1",
        headers: { "user-agent": "test-agent" }
      };

      const result = await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.INVENTORY_ADJUSTED,
        resourceType: "inventory",
        resourceId: "507f1f77bcf86cd799439011",
        metadata: {
          productName: "Alpine Backpack",
          previousStock: 10,
          adjustment: -2,
          resultingStock: 8,
          reason: "stock_correction"
        },
        req: fakeReq
      });

      expect(createdPayload.eventType).toBe(AUDIT_EVENT_TYPES.INVENTORY_ADJUSTED);
      expect(createdPayload.resourceType).toBe("inventory");
      expect(createdPayload.resourceId).toBe("507f1f77bcf86cd799439011");
      expect(createdPayload.metadata.productName).toBe("Alpine Backpack");
      expect(result.resourceType).toBe("inventory");
    });

    it("27. product status change records PRODUCT_STATUS_UPDATED event", async () => {
      let createdAuditPayload = null;
      const targetProduct = {
        _id: "507f1f77bcf86cd799439020",
        name: "Trail Shoes",
        isActive: false
      };

      vi.spyOn(Product, "findByIdAndUpdate").mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(targetProduct)
      });

      vi.spyOn(AdminAuditLog, "create").mockImplementation(async (payload) => {
        createdAuditPayload = payload;
        return { _id: "607f1f77bcf86cd799439088", ...payload };
      });

      const res = await request(app)
        .patch("/api/v1/admin/products/507f1f77bcf86cd799439020/status")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({ isActive: false });

      expect(res.status).toBe(200);
      expect(createdAuditPayload).not.toBeNull();
      expect(createdAuditPayload.eventType).toBe(AUDIT_EVENT_TYPES.PRODUCT_STATUS_UPDATED);
      expect(createdAuditPayload.resourceType).toBe("product");
      expect(createdAuditPayload.resourceId).toBe("507f1f77bcf86cd799439020");
      expect(createdAuditPayload.metadata.isActive).toBe(false);
    });

    it("28. inventory adjustment records INVENTORY_ADJUSTED event", async () => {
      let createdAuditPayload = null;
      const targetProduct = {
        _id: "507f1f77bcf86cd799439021",
        name: "Camping Stove",
        stock: 15,
        variants: []
      };

      vi.spyOn(Product, "findById").mockResolvedValue(targetProduct);
      vi.spyOn(Product, "findOneAndUpdate").mockResolvedValue({
        ...targetProduct,
        stock: 20
      });
      vi.spyOn(InventoryAdjustment, "create").mockResolvedValue({
        _id: "607f1f77bcf86cd799439077",
        product: targetProduct._id,
        productName: targetProduct.name,
        variantId: null,
        variantName: null,
        sku: null,
        previousStock: 15,
        adjustment: 5,
        resultingStock: 20,
        reason: "receiving",
        note: "Fresh stock delivered",
        createdAt: new Date()
      });

      vi.spyOn(AdminAuditLog, "create").mockImplementation(async (payload) => {
        createdAuditPayload = payload;
        return { _id: "607f1f77bcf86cd799439076", ...payload };
      });

      const res = await request(app)
        .post("/api/v1/admin/inventory/adjust")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({
          productId: "507f1f77bcf86cd799439021",
          adjustment: 5,
          reason: "receiving",
          note: "Fresh stock delivered"
        });

      expect(res.status).toBe(200);
      expect(createdAuditPayload).not.toBeNull();
      expect(createdAuditPayload.eventType).toBe(AUDIT_EVENT_TYPES.INVENTORY_ADJUSTED);
      expect(createdAuditPayload.resourceType).toBe("inventory");
      expect(createdAuditPayload.metadata.adjustment).toBe(5);
    });

    it("29. customer status change records ADMIN_CUSTOMER_STATUS_UPDATED event", async () => {
      let createdAuditPayload = null;
      const targetCustomer = {
        _id: customerId,
        name: "Customer Bob",
        email: "bob@example.com",
        role: "customer",
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(User, "findOneAndUpdate").mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(targetCustomer)
      });

      vi.spyOn(AdminAuditLog, "create").mockImplementation(async (payload) => {
        createdAuditPayload = payload;
        return { _id: "607f1f77bcf86cd799439066", ...payload };
      });

      const res = await request(app)
        .patch(`/api/v1/admin/customers/${customerId}/status`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({ isActive: false });

      expect(res.status).toBe(200);
      expect(createdAuditPayload).not.toBeNull();
      expect(createdAuditPayload.eventType).toBe(AUDIT_EVENT_TYPES.ADMIN_CUSTOMER_STATUS_UPDATED);
      expect(createdAuditPayload.resourceType).toBe("customer");
      expect(createdAuditPayload.metadata.isActive).toBe(false);
    });

    it("30. failed product status change creates NO audit event", async () => {
      const auditCreateSpy = vi.spyOn(AdminAuditLog, "create");

      vi.spyOn(Product, "findByIdAndUpdate").mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(null)
      });

      const res = await request(app)
        .patch("/api/v1/admin/products/507f1f77bcf86cd799439099/status")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({ isActive: true });

      expect(res.status).toBe(404);
      expect(auditCreateSpy).not.toHaveBeenCalled();
    });
  });
});
