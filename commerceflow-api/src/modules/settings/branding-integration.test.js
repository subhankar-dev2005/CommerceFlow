import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import User from "../users/user.model.js";
import StoreSettings, { STORE_SETTINGS_SINGLETON_KEY } from "./store-settings.model.js";
import generateToken from "../../utils/generate-token.js";
import * as logoStorage from "./logo-storage.service.js";

describe("Branding & Logo Endpoints Integration & Security Tests", () => {
  let app;
  const adminId = "507f1f77bcf86cd799439001";
  const customerId = "507f1f77bcf86cd799439002";

  let adminToken;
  let customerToken;

  const validPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();

    adminToken = generateToken({
      userId: adminId,
      email: "admin@example.com",
      role: "admin"
    });

    customerToken = generateToken({
      userId: customerId,
      email: "customer@example.com",
      role: "customer"
    });

    vi.spyOn(User, "findById").mockImplementation((id) => {
      const idStr = id?.toString();
      if (idStr === adminId) {
        return Promise.resolve({
          _id: adminId,
          email: "admin@example.com",
          role: "admin",
          isActive: true,
          tokenVersion: 0
        });
      }
      if (idStr === customerId) {
        return Promise.resolve({
          _id: customerId,
          email: "customer@example.com",
          role: "customer",
          isActive: true,
          tokenVersion: 0
        });
      }
      return Promise.resolve(null);
    });
  });

  describe("GET /api/v1/settings/branding", () => {
    it("is publicly accessible without authentication and returns safe branding data", async () => {
      vi.spyOn(StoreSettings, "findOne").mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          singletonKey: STORE_SETTINGS_SINGLETON_KEY,
          storeName: "CommerceFlow",
          logoUrl: "/api/v1/settings/logo?v=123",
          logoAlt: "CommerceFlow Logo",
          logoStorageKey: "secret-key.png",
          _id: "settings-db-id"
        })
      });

      const res = await request(app).get("/api/v1/settings/branding");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.storeName).toBe("CommerceFlow");
      expect(res.body.data.logoUrl).toBe("/api/v1/settings/logo?v=123");
      expect(res.body.data.hasCustomLogo).toBe(true);
      // Ensure no database internals or private storage paths leak
      expect(res.body.data.logoStorageKey).toBeUndefined();
      expect(res.body.data._id).toBeUndefined();
    });
  });

  describe("POST /api/v1/admin/settings/logo", () => {
    it("rejects unauthenticated requests with 401 AUTH_TOKEN_REQUIRED", async () => {
      const res = await request(app)
        .post("/api/v1/admin/settings/logo")
        .send({ image: `data:image/png;base64,${validPngBase64}` });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });

    it("rejects non-admin customer accounts with 403 FORBIDDEN", async () => {
      const res = await request(app)
        .post("/api/v1/admin/settings/logo")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ image: `data:image/png;base64,${validPngBase64}` });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("allows authorized admin to upload and persist valid logo", async () => {
      vi.spyOn(StoreSettings, "findOne").mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          singletonKey: STORE_SETTINGS_SINGLETON_KEY,
          logoStorageKey: null
        })
      });

      vi.spyOn(logoStorage, "saveLogoFile").mockResolvedValue({
        filename: "logo-test-123.png",
        fullPath: "/path/to/logo-test-123.png",
        relativeUrl: "/api/v1/settings/logo?v=12345"
      });

      vi.spyOn(StoreSettings, "findOneAndUpdate").mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: "settings-1",
          singletonKey: STORE_SETTINGS_SINGLETON_KEY,
          logoUrl: "/api/v1/settings/logo?v=12345",
          logoAlt: "Main Store Logo",
          logoUpdatedAt: new Date()
        })
      });

      const res = await request(app)
        .post("/api/v1/admin/settings/logo")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          image: `data:image/png;base64,${validPngBase64}`,
          altText: "Main Store Logo"
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.logoUrl).toBe("/api/v1/settings/logo?v=12345");
      expect(res.body.data.logoAlt).toBe("Main Store Logo");
    });

    it("rejects malicious SVG containing script tags with 400 UNSAFE_SVG_CONTENT", async () => {
      const maliciousSvg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert('pwned')</script></svg>`;
      const maliciousBase64 = Buffer.from(maliciousSvg).toString("base64");

      const res = await request(app)
        .post("/api/v1/admin/settings/logo")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          image: `data:image/svg+xml;base64,${maliciousBase64}`
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("UNSAFE_SVG_CONTENT");
    });
  });

  describe("POST /api/v1/admin/settings/logo/reset", () => {
    it("rejects unauthenticated requests with 401 AUTH_REQUIRED", async () => {
      const res = await request(app).post("/api/v1/admin/settings/logo/reset").send({});
      expect(res.status).toBe(401);
    });

    it("rejects customer accounts with 403 FORBIDDEN", async () => {
      const res = await request(app)
        .post("/api/v1/admin/settings/logo/reset")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({});
      expect(res.status).toBe(403);
    });

    it("allows authorized admin to reset logo back to default", async () => {
      vi.spyOn(StoreSettings, "findOne").mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          singletonKey: STORE_SETTINGS_SINGLETON_KEY,
          logoStorageKey: "logo-old.png"
        })
      });
      vi.spyOn(logoStorage, "deleteLogoFileSafe").mockResolvedValue(true);

      vi.spyOn(StoreSettings, "findOneAndUpdate").mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: "settings-1",
          singletonKey: STORE_SETTINGS_SINGLETON_KEY,
          logoUrl: null,
          logoAlt: "CommerceFlow Logo",
          logoUpdatedAt: new Date()
        })
      });

      const res = await request(app)
        .post("/api/v1/admin/settings/logo/reset")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.logoUrl).toBeNull();
      expect(res.body.data.hasCustomLogo).toBe(false);
    });
  });

  describe("GET /api/v1/settings/logo (CORP and Security Headers)", () => {
    it("emits Cross-Origin-Resource-Policy: cross-origin allowing frontend origin image display", async () => {
      vi.spyOn(StoreSettings, "findOne").mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          singletonKey: STORE_SETTINGS_SINGLETON_KEY,
          logoStorageKey: null
        })
      });

      const res = await request(app)
        .get("/api/v1/settings/logo")
        .set("Origin", "http://localhost:5173");

      expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
    });

    it("preserves Cross-Origin-Resource-Policy: same-origin on branding metadata and other routes", async () => {
      vi.spyOn(StoreSettings, "findOne").mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          singletonKey: STORE_SETTINGS_SINGLETON_KEY,
          storeName: "CommerceFlow",
          logoUrl: null
        })
      });

      const res = await request(app)
        .get("/api/v1/settings/branding")
        .set("Origin", "http://localhost:5173");

      expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
    });
  });

  describe("GET /api/v1/settings/announcement", () => {
    it("is publicly accessible without authentication and returns default announcement", async () => {
      vi.spyOn(StoreSettings, "findOne").mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          singletonKey: STORE_SETTINGS_SINGLETON_KEY,
          announcementText: null
        })
      });

      const res = await request(app).get("/api/v1/settings/announcement");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.announcementText).toBe("🏕️ Free shipping on orders over $50");
    });
  });

  describe("Storefront Announcement Admin & Validation Lifecycle", () => {
    it("allows authorized admin to update announcementText", async () => {
      const updated = {
        _id: "settings-1",
        singletonKey: STORE_SETTINGS_SINGLETON_KEY,
        announcementText: "🚚 Worldwide shipping on all orders this week!"
      };
      vi.spyOn(StoreSettings, "findOneAndUpdate").mockReturnValue({
        lean: vi.fn().mockResolvedValue(updated)
      });

      const res = await request(app)
        .patch("/api/v1/admin/settings")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          announcementText: "🚚 Worldwide shipping on all orders this week!"
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.settings.announcementText).toBe("🚚 Worldwide shipping on all orders this week!");
    });

    it("rejects empty announcementText with 400 validation error", async () => {
      const res = await request(app)
        .patch("/api/v1/admin/settings")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          announcementText: "   "
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects announcementText exceeding 200 characters with 400 validation error", async () => {
      const res = await request(app)
        .patch("/api/v1/admin/settings")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          announcementText: "a".repeat(201)
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("allows authorized admin to reset announcement back to default", async () => {
      const defaultAnnouncement = "🏕️ Free shipping on orders over $50";
      vi.spyOn(StoreSettings, "findOneAndUpdate").mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: "settings-1",
          singletonKey: STORE_SETTINGS_SINGLETON_KEY,
          announcementText: defaultAnnouncement
        })
      });

      const res = await request(app)
        .post("/api/v1/admin/settings/announcement/reset")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.announcementText).toBe(defaultAnnouncement);
    });

    it("rejects unauthenticated requests to reset announcement with 401", async () => {
      const res = await request(app)
        .post("/api/v1/admin/settings/announcement/reset")
        .send({});

      expect(res.status).toBe(401);
    });

    it("rejects customer accounts from resetting announcement with 403", async () => {
      const res = await request(app)
        .post("/api/v1/admin/settings/announcement/reset")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({});

      expect(res.status).toBe(403);
    });
  });
});
