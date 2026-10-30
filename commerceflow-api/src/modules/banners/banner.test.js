import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import Banner from "./banner.model.js";
import {
  getPublicBanners,
  getAdminBanners,
  getBannerById,
  createBanner,
  updateBanner,
  updateBannerStatus,
  deleteBanner,
  uploadDesktopImage,
  uploadMobileImage,
  reorderBanners,
  serveBannerImage
} from "./banner.controller.js";
import {
  createBannerSchema,
  updateBannerSchema,
  getPublicBannersSchema,
  reorderBannersSchema,
  uploadBannerImageSchema
} from "./banner.validator.js";
import * as bannerStorage from "./banner-storage.service.js";

// Valid 1x1 test image buffers
const VALID_PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const VALID_JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const VALID_WEBP_BUFFER = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38
]);

describe("Banner Module Unit Tests", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.restoreAllMocks();

    req = {
      params: {},
      query: {},
      body: {},
      user: { _id: "507f1f77bcf86cd799439011", role: "admin" },
      requestId: "req-banner-test-123"
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis()
    };

    next = vi.fn();
  });

  describe("getPublicBanners", () => {
    it("returns only active published banners for the requested placement", async () => {
      const mockBanners = [
        {
          _id: "ban1",
          title: "Winter Sale",
          placement: "hero_carousel",
          imageUrl: "https://example.com/banner1.jpg",
          altText: "Winter Sale Banner",
          targetUrl: "/shop",
          displayOrder: 1
        }
      ];

      const leanMock = vi.fn().mockResolvedValue(mockBanners);
      const selectMock = vi.fn().mockReturnValue({ lean: leanMock });
      const limitMock = vi.fn().mockReturnValue({ select: selectMock });
      const sortMock = vi.fn().mockReturnValue({ limit: limitMock });

      const findSpy = vi.spyOn(Banner, "find").mockReturnValue({ sort: sortMock });

      req.query = { placement: "hero_carousel", limit: 5 };
      await getPublicBanners(req, res, next);

      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          placement: "hero_carousel",
          status: { $in: ["published", "active"] }
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { banners: mockBanners }
        })
      );
    });

    it("regression: queries both 'published' and 'active' status banners within schedule window", async () => {
      const mockBanners = [
        {
          _id: "ban_pub",
          title: "Published Summer Sale",
          status: "published",
          placement: "hero_carousel",
          imageUrl: "https://example.com/pub.jpg",
          altText: "Summer Banner",
          targetUrl: "/shop",
          displayOrder: 1
        },
        {
          _id: "ban_act",
          title: "Active Flash Sale",
          status: "active",
          placement: "hero_carousel",
          imageUrl: "https://example.com/act.jpg",
          altText: "Flash Banner",
          targetUrl: "/sale",
          displayOrder: 2
        }
      ];

      const leanMock = vi.fn().mockResolvedValue(mockBanners);
      const selectMock = vi.fn().mockReturnValue({ lean: leanMock });
      const limitMock = vi.fn().mockReturnValue({ select: selectMock });
      const sortMock = vi.fn().mockReturnValue({ limit: limitMock });
      const findSpy = vi.spyOn(Banner, "find").mockReturnValue({ sort: sortMock });

      req.query = { placement: "hero_carousel", limit: 10 };
      await getPublicBanners(req, res, next);

      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          placement: "hero_carousel",
          status: { $in: ["published", "active"] },
          $and: expect.arrayContaining([
            expect.objectContaining({
              $or: [{ startsAt: null }, { startsAt: { $lte: expect.any(Date) } }]
            }),
            expect.objectContaining({
              $or: [
                { expiresAt: null, endsAt: null },
                { expiresAt: { $gte: expect.any(Date) } },
                { endsAt: { $gte: expect.any(Date) } }
              ]
            })
          ])
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { banners: mockBanners }
        })
      );
    });
  });

  describe("getAdminBanners", () => {
    it("returns paginated banners with search and filters", async () => {
      const mockBanners = [
        { _id: "ban1", title: "Hero Banner", placement: "hero_carousel", status: "published" }
      ];

      const leanMock = vi.fn().mockResolvedValue(mockBanners);
      const limitMock = vi.fn().mockReturnValue({ lean: leanMock });
      const skipMock = vi.fn().mockReturnValue({ limit: limitMock });
      const sortMock = vi.fn().mockReturnValue({ skip: skipMock });

      vi.spyOn(Banner, "find").mockReturnValue({ sort: sortMock });
      vi.spyOn(Banner, "countDocuments").mockResolvedValue(1);

      req.query = { page: 1, limit: 10, placement: "hero_carousel", status: "published", search: "Hero" };
      await getAdminBanners(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            banners: mockBanners,
            pagination: expect.objectContaining({
              totalBanners: 1,
              totalPages: 1
            })
          })
        })
      );
    });
  });

  describe("createBanner", () => {
    it("creates a new banner with creator attribution", async () => {
      const bannerInput = {
        title: "New Spring Launch",
        placement: "hero_carousel",
        imageUrl: "https://example.com/spring.jpg",
        altText: "Spring Collection",
        targetUrl: "/shop?collection=spring",
        displayOrder: 2,
        status: "published"
      };

      const createdBanner = { _id: "ban_new", ...bannerInput, createdBy: req.user._id };
      vi.spyOn(Banner, "create").mockResolvedValue(createdBanner);

      req.body = bannerInput;
      await createBanner(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { banner: createdBanner }
        })
      );
    });
  });

  describe("updateBannerStatus", () => {
    it("updates banner status successfully", async () => {
      const updated = { _id: "ban1", status: "archived" };
      vi.spyOn(Banner, "findByIdAndUpdate").mockResolvedValue(updated);

      req.params = { id: "507f1f77bcf86cd799439011" };
      req.body = { status: "archived" };
      await updateBannerStatus(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { banner: updated }
        })
      );
    });

    it("calls next with error if banner not found", async () => {
      vi.spyOn(Banner, "findByIdAndUpdate").mockResolvedValue(null);

      req.params = { id: "507f1f77bcf86cd799439011" };
      req.body = { status: "archived" };
      await updateBannerStatus(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: "BANNER_NOT_FOUND"
        })
      );
    });
  });

  describe("deleteBanner", () => {
    it("deletes banner and cleans up associated image files", async () => {
      const mockBanner = {
        _id: "507f1f77bcf86cd799439011",
        desktopImageStorageKey: "desktop-key-123.jpg",
        mobileImageStorageKey: "mobile-key-456.jpg"
      };
      vi.spyOn(Banner, "findByIdAndDelete").mockResolvedValue(mockBanner);
      const deleteFileSpy = vi.spyOn(bannerStorage, "deleteBannerFileSafe").mockResolvedValue(true);

      req.params = { id: "507f1f77bcf86cd799439011" };
      await deleteBanner(req, res, next);

      expect(deleteFileSpy).toHaveBeenCalledWith("desktop-key-123.jpg");
      expect(deleteFileSpy).toHaveBeenCalledWith("mobile-key-456.jpg");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { bannerId: "507f1f77bcf86cd799439011" }
        })
      );
    });
  });

  describe("Image Upload Operations", () => {
    it("uploads and updates desktop image, safely cleaning prior asset", async () => {
      const mockBanner = {
        _id: "507f1f77bcf86cd799439011",
        desktopImageStorageKey: "old-desktop.jpg",
        save: vi.fn().mockResolvedValue(true)
      };
      vi.spyOn(Banner, "findById").mockResolvedValue(mockBanner);
      vi.spyOn(bannerStorage, "saveBannerImageFile").mockResolvedValue({
        filename: "new-desktop-hash.png",
        relativeUrl: "/api/v1/banners/images/new-desktop-hash.png"
      });
      const cleanupSpy = vi.spyOn(bannerStorage, "deleteBannerFileSafe").mockResolvedValue(true);

      req.params = { id: "507f1f77bcf86cd799439011" };
      req.body = {
        image: `data:image/png;base64,${VALID_PNG_BUFFER.toString("base64")}`
      };

      await uploadDesktopImage(req, res, next);

      expect(mockBanner.imageUrl).toBe("/api/v1/banners/images/new-desktop-hash.png");
      expect(mockBanner.desktopImageStorageKey).toBe("new-desktop-hash.png");
      expect(mockBanner.save).toHaveBeenCalled();
      expect(cleanupSpy).toHaveBeenCalledWith("old-desktop.jpg");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            imageUrl: "/api/v1/banners/images/new-desktop-hash.png"
          })
        })
      );
    });

    it("uploads and updates mobile image, leaving prior desktop image intact", async () => {
      const mockBanner = {
        _id: "507f1f77bcf86cd799439011",
        imageUrl: "/api/v1/banners/images/desktop.jpg",
        mobileImageStorageKey: null,
        save: vi.fn().mockResolvedValue(true)
      };
      vi.spyOn(Banner, "findById").mockResolvedValue(mockBanner);
      vi.spyOn(bannerStorage, "saveBannerImageFile").mockResolvedValue({
        filename: "new-mobile-hash.webp",
        relativeUrl: "/api/v1/banners/images/new-mobile-hash.webp"
      });

      req.params = { id: "507f1f77bcf86cd799439011" };
      req.body = {
        image: `data:image/webp;base64,${VALID_WEBP_BUFFER.toString("base64")}`
      };

      await uploadMobileImage(req, res, next);

      expect(mockBanner.mobileImageUrl).toBe("/api/v1/banners/images/new-mobile-hash.webp");
      expect(mockBanner.mobileImageStorageKey).toBe("new-mobile-hash.webp");
      expect(mockBanner.imageUrl).toBe("/api/v1/banners/images/desktop.jpg");
      expect(mockBanner.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("rejects SVG banner image upload", () => {
      const svgBuffer = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><circle/></svg>");
      expect(() => {
        bannerStorage.validateBannerImageBuffer(svgBuffer);
      }).toThrow(/SVG images are not permitted/);
    });

    it("rejects oversized image buffers exceeding 5MB limit", () => {
      const hugeBuffer = Buffer.alloc(6 * 1024 * 1024);
      hugeBuffer[0] = 0x89;
      hugeBuffer[1] = 0x50;
      hugeBuffer[2] = 0x4e;
      hugeBuffer[3] = 0x47;
      expect(() => {
        bannerStorage.validateBannerImageBuffer(hugeBuffer);
      }).toThrow(/File size exceeds/);
    });

    it("rejects corrupt or unrecognized image buffers", () => {
      const corruptBuffer = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
      expect(() => {
        bannerStorage.validateBannerImageBuffer(corruptBuffer);
      }).toThrow(/Unsupported or invalid image format/);
    });
  });

  describe("reorderBanners", () => {
    it("atomically reorders banners and updates display positions", async () => {
      vi.spyOn(Banner, "countDocuments").mockResolvedValue(2);
      const bulkWriteSpy = vi.spyOn(Banner, "bulkWrite").mockResolvedValue({ modifiedCount: 2 });

      req.body = {
        banners: [
          { id: "507f1f77bcf86cd799439011", position: 1 },
          { id: "507f1f77bcf86cd799439012", position: 2 }
        ]
      };

      await reorderBanners(req, res, next);

      expect(bulkWriteSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            updateOne: expect.objectContaining({
              filter: { _id: "507f1f77bcf86cd799439011" },
              update: expect.objectContaining({ $set: expect.objectContaining({ position: 1, displayOrder: 1 }) })
            })
          })
        ])
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { reorderedCount: 2 }
        })
      );
    });

    it("rejects reordering when duplicate banner IDs are submitted", async () => {
      req.body = {
        banners: [
          { id: "507f1f77bcf86cd799439011", position: 1 },
          { id: "507f1f77bcf86cd799439011", position: 2 }
        ]
      };

      await reorderBanners(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "DUPLICATE_REORDER_IDS"
        })
      );
    });

    it("rejects reordering when one or more banner IDs do not exist", async () => {
      vi.spyOn(Banner, "countDocuments").mockResolvedValue(1); // Only 1 exists, but 2 submitted

      req.body = {
        banners: [
          { id: "507f1f77bcf86cd799439011", position: 1 },
          { id: "507f1f77bcf86cd799439012", position: 2 }
        ]
      };

      await reorderBanners(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: "BANNER_NOT_FOUND"
        })
      );
    });
  });

  describe("serveBannerImage", () => {
    it("returns 404 when requested image filename is not on disk", async () => {
      vi.spyOn(bannerStorage, "getBannerFilePathSafe").mockReturnValue(null);

      req.params = { filename: "non-existent.jpg" };
      await serveBannerImage(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: "BANNER_IMAGE_NOT_FOUND"
          })
        })
      );
    });
  });

  describe("Banner Model Schedule & Active State", () => {
    it("isCurrentlyActive returns true for published banner within valid schedule", () => {
      const banner = new Banner({
        title: "Active Hero",
        placement: "hero_carousel",
        imageUrl: "https://example.com/hero.jpg",
        altText: "Hero",
        targetUrl: "/shop",
        status: "published",
        startsAt: new Date(Date.now() - 3600000), // 1 hour ago
        endsAt: new Date(Date.now() + 3600000) // 1 hour from now
      });

      expect(banner.isCurrentlyActive()).toBe(true);
    });

    it("isCurrentlyActive returns false for draft or future banners", () => {
      const draftBanner = new Banner({
        title: "Draft Hero",
        placement: "hero_carousel",
        imageUrl: "https://example.com/hero.jpg",
        altText: "Hero",
        targetUrl: "/shop",
        status: "draft"
      });
      expect(draftBanner.isCurrentlyActive()).toBe(false);

      const futureBanner = new Banner({
        title: "Future Hero",
        placement: "hero_carousel",
        imageUrl: "https://example.com/hero.jpg",
        altText: "Hero",
        targetUrl: "/shop",
        status: "published",
        startsAt: new Date(Date.now() + 86400000) // Tomorrow
      });
      expect(futureBanner.isCurrentlyActive()).toBe(false);
    });

    it("isCurrentlyActive returns false for expired banners", () => {
      const expiredBanner = new Banner({
        title: "Expired Hero",
        placement: "hero_carousel",
        imageUrl: "https://example.com/hero.jpg",
        altText: "Hero",
        targetUrl: "/shop",
        status: "published",
        endsAt: new Date(Date.now() - 60000) // 1 min ago
      });
      expect(expiredBanner.isCurrentlyActive()).toBe(false);
    });
  });

  describe("Banner Validator Security", () => {
    it("rejects malicious javascript: URLs in targetUrl", () => {
      const invalidData = {
        body: {
          title: "Malicious Banner",
          placement: "hero_carousel",
          imageUrl: "https://example.com/banner.jpg",
          altText: "Promo banner",
          targetUrl: "javascript:alert('xss')",
          displayOrder: 1
        }
      };

      const result = createBannerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("rejects non-http/https image URLs", () => {
      const invalidData = {
        body: {
          title: "File URL Banner",
          placement: "hero_carousel",
          imageUrl: "ftp://example.com/banner.jpg",
          altText: "Promo banner",
          targetUrl: "/shop",
          displayOrder: 1
        }
      };

      const result = createBannerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("accepts safe relative internal routes and valid https URLs", () => {
      const validInternal = {
        body: {
          title: "Spring Sale",
          placement: "hero_carousel",
          imageUrl: "https://images.unsplash.com/photo-1",
          altText: "Spring Collection Banner",
          targetUrl: "/shop?category=Apparel",
          displayOrder: 0
        }
      };

      const result = createBannerSchema.safeParse(validInternal);
      expect(result.success).toBe(true);
    });

    it("enforces expiresAt after startsAt", () => {
      const invalidDates = {
        body: {
          title: "Inverted Dates",
          placement: "hero_carousel",
          imageUrl: "https://example.com/img.jpg",
          altText: "Test banner",
          targetUrl: "/shop",
          startsAt: "2026-10-20T00:00:00.000Z",
          expiresAt: "2026-10-10T00:00:00.000Z"
        }
      };

      const result = createBannerSchema.safeParse(invalidDates);
      expect(result.success).toBe(false);
    });

    it("accepts valid destinations: /products/example, https://trusted.example/path, http://trusted.example/path", () => {
      const validUrls = [
        "/products/example",
        "https://trusted.example/path",
        "http://trusted.example/path"
      ];

      for (const targetUrl of validUrls) {
        const result = createBannerSchema.safeParse({
          body: {
            title: "Valid Banner",
            placement: "hero_carousel",
            imageUrl: "https://example.com/banner.jpg",
            altText: "Promo banner",
            targetUrl,
            displayOrder: 1
          }
        });
        expect(result.success, `Expected ${targetUrl} to be valid`).toBe(true);
      }
    });

    it("rejects URLs containing embedded credentials (username/password)", () => {
      const credentialUrls = [
        "https://user:pass@evil.example/path",
        "https://user@evil.example/path",
        "http://admin:secret@malicious.com"
      ];

      for (const targetUrl of credentialUrls) {
        const result = createBannerSchema.safeParse({
          body: {
            title: "Credential Banner",
            placement: "hero_carousel",
            imageUrl: "https://example.com/banner.jpg",
            altText: "Promo banner",
            targetUrl,
            displayOrder: 1
          }
        });
        expect(result.success, `Expected ${targetUrl} with credentials to be rejected`).toBe(false);
      }
    });

    it("rejects protocol-relative URLs, javascript, data URIs, and unexpected protocols", () => {
      const dangerousUrls = [
        "//evil.example/path",
        "javascript:alert(1)",
        "javascript(1)",
        "data:text/html,<h1>hack</h1>",
        "ftp://example.com/path",
        "file:///etc/passwd",
        "blob:http://example.com/uuid",
        "/\\evil-escape",
        "/<script>alert(1)</script>",
        "https://evil.com/\\malicious",
        "not-a-url",
        "http://"
      ];

      for (const targetUrl of dangerousUrls) {
        const result = createBannerSchema.safeParse({
          body: {
            title: "Dangerous Banner",
            placement: "hero_carousel",
            imageUrl: "https://example.com/banner.jpg",
            altText: "Promo banner",
            targetUrl,
            displayOrder: 1
          }
        });
        expect(result.success, `Expected ${targetUrl} to be rejected`).toBe(false);
      }
    });

    it("rejects URLs containing credentials at Mongoose model level", async () => {
      const banner = new Banner({
        title: "Model Validation Banner",
        placement: "hero_carousel",
        imageUrl: "https://example.com/banner.jpg",
        altText: "Model Alt Text",
        targetUrl: "https://user:pass@evil.example/path"
      });

      let err;
      try {
        await banner.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.errors["targetUrl"]).toBeDefined();
    });

    it("accepts valid relative path at Mongoose model level", async () => {
      const banner = new Banner({
        title: "Model Validation Banner",
        placement: "hero_carousel",
        imageUrl: "https://example.com/banner.jpg",
        altText: "Model Alt Text",
        targetUrl: "/products/example"
      });

      let err;
      try {
        await banner.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeUndefined();
    });
  });

  describe("Public Banner Rate Limiting Isolation", () => {
    let app;

    beforeEach(() => {
      vi.restoreAllMocks();
      app = createApp();
    });

    it("public GET /api/v1/banners does not consume global rate limit quota on sensitive endpoints", async () => {
      vi.spyOn(Banner, "find").mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      });

      // Issue 3 public banner metadata requests
      for (let i = 0; i < 3; i += 1) {
        await request(app).get("/api/v1/banners");
      }

      // Check a sensitive endpoint governed by global limiter
      const profileRes = await request(app).get("/api/v1/users/profile");
      expect(profileRes.headers["ratelimit"]).toBeDefined();
      expect(profileRes.headers["ratelimit"]).toContain("limit=100");
      // Global quota remaining must reflect only the profile request (99 remaining), not 96
      expect(profileRes.headers["ratelimit"]).toContain("remaining=99");
    });

    it("public GET /api/v1/banners/images/:filename is exempted from consuming global rate limit quota", async () => {
      // Issue 3 image requests
      for (let i = 0; i < 3; i += 1) {
        await request(app).get("/api/v1/banners/images/banner-test.jpg");
      }

      // Check sensitive endpoint governed by global limiter
      const profileRes = await request(app).get("/api/v1/users/profile");
      expect(profileRes.headers["ratelimit"]).toBeDefined();
      expect(profileRes.headers["ratelimit"]).toContain("remaining=99");
    });

    it("admin GET /api/v1/admin/banners remains protected under global rate limiter", async () => {
      // Admin endpoint consumes quota from the global bucket
      const adminRes = await request(app).get("/api/v1/admin/banners");
      expect(adminRes.headers["ratelimit"]).toBeDefined();
      expect(adminRes.headers["ratelimit"]).toContain("limit=100");
      expect(adminRes.headers["ratelimit"]).toContain("remaining=99");
    });
  });
});
