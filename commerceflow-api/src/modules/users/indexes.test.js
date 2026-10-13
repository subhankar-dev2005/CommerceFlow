import { describe, it, expect } from "vitest";
import User from "./user.model.js";

describe("User Schema Indexes", () => {
  it("defines expected indexes on user schema", () => {
    const indexes = User.schema.indexes();

    expect(indexes).toContainEqual([
      { role: 1, createdAt: -1 },
      {}
    ]);

    expect(indexes).toContainEqual([
      { role: 1, isActive: 1, createdAt: -1 },
      {}
    ]);
  });
});
