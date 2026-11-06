import mongoose from "mongoose";
import { describe, it, expect } from "vitest";
import Vendor, { VENDOR_STATUSES } from "./vendor.model.js";

describe("Vendor Model Schema & Validation", () => {
  function createValidVendorData(overrides = {}) {
    return {
      name: "Acme Electronics",
      slug: "acme-electronics",
      status: "pending",
      isFirstParty: false,
      ...overrides
    };
  }

  it("defines expected schema paths and configuration", () => {
    const paths = Vendor.schema.paths;

    expect(paths.name).toBeDefined();
    expect(paths.name.instance).toBe("String");
    expect(paths.name.isRequired).toBe(true);

    expect(paths.slug).toBeDefined();
    expect(paths.slug.instance).toBe("String");
    expect(paths.slug.isRequired).toBe(true);

    expect(paths.status).toBeDefined();
    expect(paths.status.instance).toBe("String");
    expect(paths.status.defaultValue).toBe("pending");

    expect(paths.isFirstParty).toBeDefined();
    expect(paths.isFirstParty.instance).toBe("Boolean");
    expect(paths.isFirstParty.defaultValue).toBe(false);

    expect(paths.createdAt).toBeDefined();
    expect(paths.updatedAt).toBeDefined();
  });

  it("defines a unique index on slug", () => {
    const indexes = Vendor.schema.indexes();

    const slugIndex = indexes.find(
      ([spec, options]) => spec.slug === 1 && options?.unique === true
    );

    expect(slugIndex).toBeDefined();
  });

  it("validates a complete, valid vendor document", async () => {
    const vendor = new Vendor(createValidVendorData());
    await vendor.validate();

    expect(vendor.name).toBe("Acme Electronics");
    expect(vendor.slug).toBe("acme-electronics");
    expect(vendor.status).toBe("pending");
    expect(vendor.isFirstParty).toBe(false);
  });

  it("defaults status to 'pending' when omitted", async () => {
    const vendor = new Vendor({
      name: "Heritage Crafts",
      slug: "heritage-crafts"
    });
    await vendor.validate();

    expect(vendor.status).toBe("pending");
    expect(vendor.isFirstParty).toBe(false);
  });

  it("allows setting status to 'active' or 'suspended'", async () => {
    for (const validStatus of ["active", "suspended"]) {
      const vendor = new Vendor(createValidVendorData({ status: validStatus }));
      await vendor.validate();
      expect(vendor.status).toBe(validStatus);
    }
  });

  it("allows setting isFirstParty to true for platform retail entity", async () => {
    const vendor = new Vendor(
      createValidVendorData({
        name: "CommerceFlow Retail",
        slug: "commerceflow-retail",
        status: "active",
        isFirstParty: true
      })
    );
    await vendor.validate();

    expect(vendor.isFirstParty).toBe(true);
    expect(vendor.status).toBe("active");
  });

  it("rejects validation when name is missing or too short", async () => {
    const vendorMissingName = new Vendor(createValidVendorData({ name: undefined }));
    await expect(vendorMissingName.validate()).rejects.toThrow(/Vendor name is required/);

    const vendorShortName = new Vendor(createValidVendorData({ name: "A" }));
    await expect(vendorShortName.validate()).rejects.toThrow(/at least 2 characters/);
  });

  it("rejects validation when slug is missing", async () => {
    const vendor = new Vendor(createValidVendorData({ slug: undefined }));
    await expect(vendor.validate()).rejects.toThrow(/Vendor slug is required/);
  });

  it("trims whitespace from name and slug, and lowercases slug", async () => {
    const vendor = new Vendor({
      name: "  Spaced Out Goods  ",
      slug: "  SPACED-OUT-GOODS  "
    });
    await vendor.validate();

    expect(vendor.name).toBe("Spaced Out Goods");
    expect(vendor.slug).toBe("spaced-out-goods");
  });

  it("rejects invalid status values outside the enum", async () => {
    const vendor = new Vendor(createValidVendorData({ status: "approved" }));
    await expect(vendor.validate()).rejects.toThrow(/Status must be either/);
  });

  it("exports VENDOR_STATUSES enum matching model configuration", () => {
    expect(VENDOR_STATUSES).toEqual(["pending", "active", "suspended"]);
  });
});
