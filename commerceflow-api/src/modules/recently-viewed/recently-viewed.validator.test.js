import { describe, it, expect } from "vitest";
import {
  recordProductViewSchema,
  getRecentlyViewedQuerySchema,
  mergeRecentlyViewedSchema
} from "./recently-viewed.validator.js";
import {
  DEFAULT_RECENTLY_VIEWED_LIMIT,
  MAX_RECENTLY_VIEWED_LIMIT,
  MAX_STORED_RECENTLY_VIEWED
} from "./recently-viewed.constants.js";

const VALID_ID_1 = "507f1f77bcf86cd799439011";
const VALID_ID_2 = "507f1f77bcf86cd799439012";

describe("Recently Viewed Validators", () => {
  describe("recordProductViewSchema", () => {
    function parse(body) {
      return recordProductViewSchema.safeParse({
        body,
        query: {},
        params: {}
      });
    }

    it("accepts a valid 24-character hexadecimal productId", () => {
      const result = parse({ productId: VALID_ID_1 });
      expect(result.success).toBe(true);
      expect(result.data.body.productId).toBe(VALID_ID_1);
    });

    it("rejects missing productId", () => {
      const result = parse({});
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toContain("productId");
    });

    it("rejects productId that is too short (23 chars)", () => {
      const result = parse({ productId: "507f1f77bcf86cd79943901" });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe("Invalid product ID");
    });

    it("rejects productId that is too long (25 chars)", () => {
      const result = parse({ productId: "507f1f77bcf86cd7994390111" });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe("Invalid product ID");
    });

    it("rejects productId with non-hex characters", () => {
      const result = parse({ productId: "507f1f77bcf86cd79943901z" });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe("Invalid product ID");
    });

    it("rejects non-string productId", () => {
      const result = parse({ productId: 123456789 });
      expect(result.success).toBe(false);
    });

    it("rejects unknown extra fields (strict body validation)", () => {
      const result = parse({
        productId: VALID_ID_1,
        userId: "507f1f77bcf86cd799439099",
        price: 999
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].code).toBe("unrecognized_keys");
    });
  });

  describe("getRecentlyViewedQuerySchema", () => {
    function parse(query) {
      return getRecentlyViewedQuerySchema.safeParse({
        body: {},
        query,
        params: {}
      });
    }

    it("defaults limit to DEFAULT_RECENTLY_VIEWED_LIMIT (10) when query is empty", () => {
      const result = parse({});
      expect(result.success).toBe(true);
      expect(result.data.query.limit).toBe(DEFAULT_RECENTLY_VIEWED_LIMIT);
    });

    it("accepts valid boundary limits: 1, 10, and MAX_RECENTLY_VIEWED_LIMIT (20)", () => {
      const resMin = parse({ limit: "1" });
      expect(resMin.success).toBe(true);
      expect(resMin.data.query.limit).toBe(1);

      const resMid = parse({ limit: "10" });
      expect(resMid.success).toBe(true);
      expect(resMid.data.query.limit).toBe(10);

      const resMax = parse({ limit: String(MAX_RECENTLY_VIEWED_LIMIT) });
      expect(resMax.success).toBe(true);
      expect(resMax.data.query.limit).toBe(MAX_RECENTLY_VIEWED_LIMIT);
    });

    it("rejects limit less than 1", () => {
      const result = parse({ limit: "0" });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain("Limit must be at least 1");
    });

    it("rejects negative limit", () => {
      const result = parse({ limit: "-5" });
      expect(result.success).toBe(false);
    });

    it("rejects limit exceeding MAX_RECENTLY_VIEWED_LIMIT (20)", () => {
      const result = parse({ limit: "21" });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain(`Limit cannot exceed ${MAX_RECENTLY_VIEWED_LIMIT}`);
    });

    it("rejects non-integer limit (e.g. 5.5)", () => {
      const result = parse({ limit: "5.5" });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain("Limit must be an integer");
    });

    it("rejects non-numeric string limit", () => {
      const result = parse({ limit: "twenty" });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toMatch(/number/i);
    });
  });

  describe("mergeRecentlyViewedSchema", () => {
    function parse(body) {
      return mergeRecentlyViewedSchema.safeParse({
        body,
        query: {},
        params: {}
      });
    }

    it("accepts a valid array of product IDs", () => {
      const result = parse({ productIds: [VALID_ID_1, VALID_ID_2] });
      expect(result.success).toBe(true);
      expect(result.data.body.productIds).toEqual([VALID_ID_1, VALID_ID_2]);
    });

    it("rejects empty productIds array", () => {
      const result = parse({ productIds: [] });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain("cannot be empty");
    });

    it("rejects missing productIds", () => {
      const result = parse({});
      expect(result.success).toBe(false);
    });

    it("rejects productIds when it is not an array", () => {
      const result = parse({ productIds: VALID_ID_1 });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toMatch(/array/i);
    });

    it("rejects array exceeding MAX_STORED_RECENTLY_VIEWED (12 items)", () => {
      const ids = Array.from({ length: MAX_STORED_RECENTLY_VIEWED + 1 }).map(
        () => VALID_ID_1
      );
      const result = parse({ productIds: ids });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain(`cannot exceed ${MAX_STORED_RECENTLY_VIEWED}`);
    });

    it("accepts array with exact boundary limit of MAX_STORED_RECENTLY_VIEWED (12 items)", () => {
      const ids = Array.from({ length: MAX_STORED_RECENTLY_VIEWED }).map(
        () => VALID_ID_1
      );
      const result = parse({ productIds: ids });
      expect(result.success).toBe(true);
      expect(result.data.body.productIds).toHaveLength(MAX_STORED_RECENTLY_VIEWED);
    });

    it("rejects array containing an invalid/malformed product ID", () => {
      const result = parse({ productIds: [VALID_ID_1, "bad-id", VALID_ID_2] });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe("Invalid product ID");
    });

    it("rejects unknown extra fields (strict body validation)", () => {
      const result = parse({
        productIds: [VALID_ID_1],
        source: "guest-cookie"
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].code).toBe("unrecognized_keys");
    });
  });
});
