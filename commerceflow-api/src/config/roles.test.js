import { describe, it, expect } from "vitest";
import { ROLES, ALL_ROLES, ADMINISTRATIVE_ROLES, ROLE_EXPANSIONS } from "./roles.js";

describe("Roles Configuration Matrix", () => {
  it("exports frozen ROLES object with customer, admin, and super_admin", () => {
    expect(ROLES.CUSTOMER).toBe("customer");
    expect(ROLES.ADMIN).toBe("admin");
    expect(ROLES.SUPER_ADMIN).toBe("super_admin");
    expect(Object.isFrozen(ROLES)).toBe(true);
  });

  it("exports ALL_ROLES containing all three valid roles", () => {
    expect(ALL_ROLES).toEqual(["customer", "admin", "super_admin"]);
    expect(Object.isFrozen(ALL_ROLES)).toBe(true);
  });

  it("exports ADMINISTRATIVE_ROLES containing admin and super_admin", () => {
    expect(ADMINISTRATIVE_ROLES).toEqual(["admin", "super_admin"]);
    expect(Object.isFrozen(ADMINISTRATIVE_ROLES)).toBe(true);
  });

  it("configures explicit role expansions correctly", () => {
    expect(ROLE_EXPANSIONS[ROLES.ADMIN]).toEqual(["admin", "super_admin"]);
    expect(ROLE_EXPANSIONS[ROLES.SUPER_ADMIN]).toEqual(["super_admin"]);
    expect(ROLE_EXPANSIONS[ROLES.CUSTOMER]).toEqual(["customer"]);
    expect(Object.isFrozen(ROLE_EXPANSIONS)).toBe(true);
  });
});
