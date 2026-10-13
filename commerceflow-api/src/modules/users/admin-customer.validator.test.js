import { describe, it, expect } from "vitest";
import {
  getAdminCustomersSchema,
  customerIdParamSchema,
  updateCustomerStatusSchema
} from "./admin-customer.validator.js";

describe("getAdminCustomersSchema Validator Unit Tests", () => {
  it("applies default values when query is empty", () => {
    const result = getAdminCustomersSchema.safeParse({ query: {} });

    expect(result.success).toBe(true);
    expect(result.data.query).toEqual({
      page: 1,
      limit: 10,
      status: "all",
      sortBy: "createdAt",
      sortOrder: "desc"
    });
  });

  it("accepts valid custom pagination and filters", () => {
    const query = {
      page: "3",
      limit: "25",
      search: "  Alice Smith  ",
      status: "active",
      sortBy: "name",
      sortOrder: "asc"
    };

    const result = getAdminCustomersSchema.safeParse({ query });

    expect(result.success).toBe(true);
    expect(result.data.query).toEqual({
      page: 3,
      limit: 25,
      search: "Alice Smith",
      status: "active",
      sortBy: "name",
      sortOrder: "asc"
    });
  });

  it("accepts inactive and all status values", () => {
    const resInactive = getAdminCustomersSchema.safeParse({
      query: { status: "inactive" }
    });
    expect(resInactive.success).toBe(true);
    expect(resInactive.data.query.status).toBe("inactive");

    const resAll = getAdminCustomersSchema.safeParse({
      query: { status: "all" }
    });
    expect(resAll.success).toBe(true);
    expect(resAll.data.query.status).toBe("all");
  });

  it("rejects invalid status", () => {
    const result = getAdminCustomersSchema.safeParse({
      query: { status: "pending" }
    });

    expect(result.success).toBe(false);
  });

  it("accepts email sorting", () => {
    const result = getAdminCustomersSchema.safeParse({
      query: { sortBy: "email", sortOrder: "asc" }
    });

    expect(result.success).toBe(true);
    expect(result.data.query.sortBy).toBe("email");
    expect(result.data.query.sortOrder).toBe("asc");
  });

  it("rejects disallowed sort fields like password or role", () => {
    const resPassword = getAdminCustomersSchema.safeParse({
      query: { sortBy: "password" }
    });
    expect(resPassword.success).toBe(false);

    const resRole = getAdminCustomersSchema.safeParse({
      query: { sortBy: "role" }
    });
    expect(resRole.success).toBe(false);
  });

  it("rejects invalid sortOrder", () => {
    const result = getAdminCustomersSchema.safeParse({
      query: { sortOrder: "diagonal" }
    });

    expect(result.success).toBe(false);
  });

  it("enforces limit bounds (1 to 50)", () => {
    const resMin = getAdminCustomersSchema.safeParse({
      query: { limit: "1" }
    });
    expect(resMin.success).toBe(true);
    expect(resMin.data.query.limit).toBe(1);

    const resMax = getAdminCustomersSchema.safeParse({
      query: { limit: "50" }
    });
    expect(resMax.success).toBe(true);
    expect(resMax.data.query.limit).toBe(50);

    const resZero = getAdminCustomersSchema.safeParse({
      query: { limit: "0" }
    });
    expect(resZero.success).toBe(false);

    const resOver = getAdminCustomersSchema.safeParse({
      query: { limit: "51" }
    });
    expect(resOver.success).toBe(false);
  });

  it("enforces page bounds (min 1, integer)", () => {
    const resZero = getAdminCustomersSchema.safeParse({
      query: { page: "0" }
    });
    expect(resZero.success).toBe(false);

    const resNegative = getAdminCustomersSchema.safeParse({
      query: { page: "-5" }
    });
    expect(resNegative.success).toBe(false);

    const resFloat = getAdminCustomersSchema.safeParse({
      query: { page: "2.5" }
    });
    expect(resFloat.success).toBe(false);
  });

  it("enforces search max length of 100 characters", () => {
    const validSearch = "a".repeat(100);
    const resValid = getAdminCustomersSchema.safeParse({
      query: { search: validSearch }
    });
    expect(resValid.success).toBe(true);

    const longSearch = "a".repeat(101);
    const resLong = getAdminCustomersSchema.safeParse({
      query: { search: longSearch }
    });
    expect(resLong.success).toBe(false);
  });
});

describe("customerIdParamSchema Validator Unit Tests", () => {
  it("accepts valid 24-character hexadecimal ObjectId", () => {
    const result = customerIdParamSchema.safeParse({
      params: { customerId: "507f1f77bcf86cd799439011" }
    });

    expect(result.success).toBe(true);
    expect(result.data.params.customerId).toBe("507f1f77bcf86cd799439011");
  });

  it("rejects non-hexadecimal characters", () => {
    const result = customerIdParamSchema.safeParse({
      params: { customerId: "507f1f77bcf86cd79943901z" }
    });

    expect(result.success).toBe(false);
  });

  it("rejects shorter than 24 characters", () => {
    const result = customerIdParamSchema.safeParse({
      params: { customerId: "507f1f77bcf86cd79943901" }
    });

    expect(result.success).toBe(false);
  });

  it("rejects longer than 24 characters", () => {
    const result = customerIdParamSchema.safeParse({
      params: { customerId: "507f1f77bcf86cd7994390111" }
    });

    expect(result.success).toBe(false);
  });

  it("rejects missing or non-string customerId", () => {
    const resMissing = customerIdParamSchema.safeParse({ params: {} });
    expect(resMissing.success).toBe(false);

    const resNumber = customerIdParamSchema.safeParse({
      params: { customerId: 12345 }
    });
    expect(resNumber.success).toBe(false);
  });
});

describe("updateCustomerStatusSchema Validator Unit Tests", () => {
  const validCustomerId = "507f1f77bcf86cd799439011";

  it("accepts valid boolean isActive: true", () => {
    const result = updateCustomerStatusSchema.safeParse({
      params: { customerId: validCustomerId },
      body: { isActive: true }
    });

    expect(result.success).toBe(true);
    expect(result.data.body.isActive).toBe(true);
  });

  it("accepts valid boolean isActive: false", () => {
    const result = updateCustomerStatusSchema.safeParse({
      params: { customerId: validCustomerId },
      body: { isActive: false }
    });

    expect(result.success).toBe(true);
    expect(result.data.body.isActive).toBe(false);
  });

  it("rejects missing isActive in body", () => {
    const result = updateCustomerStatusSchema.safeParse({
      params: { customerId: validCustomerId },
      body: {}
    });

    expect(result.success).toBe(false);
  });

  it("rejects string 'true' and 'false'", () => {
    const resTrue = updateCustomerStatusSchema.safeParse({
      params: { customerId: validCustomerId },
      body: { isActive: "true" }
    });
    expect(resTrue.success).toBe(false);

    const resFalse = updateCustomerStatusSchema.safeParse({
      params: { customerId: validCustomerId },
      body: { isActive: "false" }
    });
    expect(resFalse.success).toBe(false);
  });

  it("rejects numbers (e.g. 1 and 0)", () => {
    const resOne = updateCustomerStatusSchema.safeParse({
      params: { customerId: validCustomerId },
      body: { isActive: 1 }
    });
    expect(resOne.success).toBe(false);

    const resZero = updateCustomerStatusSchema.safeParse({
      params: { customerId: validCustomerId },
      body: { isActive: 0 }
    });
    expect(resZero.success).toBe(false);
  });

  it("rejects null and array", () => {
    const resNull = updateCustomerStatusSchema.safeParse({
      params: { customerId: validCustomerId },
      body: { isActive: null }
    });
    expect(resNull.success).toBe(false);

    const resArray = updateCustomerStatusSchema.safeParse({
      params: { customerId: validCustomerId },
      body: { isActive: [true] }
    });
    expect(resArray.success).toBe(false);
  });

  it("rejects unrecognized fields in body (strict mode)", () => {
    const result = updateCustomerStatusSchema.safeParse({
      params: { customerId: validCustomerId },
      body: { isActive: true, role: "admin" }
    });

    expect(result.success).toBe(false);
  });

  it("validates customerId in params", () => {
    const result = updateCustomerStatusSchema.safeParse({
      params: { customerId: "invalid-id" },
      body: { isActive: true }
    });

    expect(result.success).toBe(false);
  });
});
