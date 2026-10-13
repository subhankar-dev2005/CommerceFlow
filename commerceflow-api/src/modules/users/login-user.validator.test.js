import { describe, it, expect } from "vitest";

import loginUserSchema from "./login-user.validator.js";

describe("loginUserSchema", () => {
  it("accepts a valid login payload", () => {
    const result = loginUserSchema.safeParse({
      body: {
        email: "testcustomer@commerceflow.com",
        password: "correct-password"
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(true);
  });

  it("normalizes the email to lowercase", () => {
    const result = loginUserSchema.safeParse({
      body: {
        email: "TestCustomer@CommerceFlow.COM",
        password: "correct-password"
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(true);
    expect(result.data.body.email).toBe(
      "testcustomer@commerceflow.com"
    );
  });

  it("rejects an invalid email", () => {
    const result = loginUserSchema.safeParse({
      body: {
        email: "invalid-email",
        password: "correct-password"
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(false);

    expect(
      result.error.issues.some(
        (issue) =>
          issue.path.join(".") === "body.email"
      )
    ).toBe(true);
  });

  it("rejects a missing password", () => {
    const result = loginUserSchema.safeParse({
      body: {
        email: "testcustomer@commerceflow.com"
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(false);

    expect(
      result.error.issues.some(
        (issue) =>
          issue.path.join(".") === "body.password"
      )
    ).toBe(true);
  });
});
