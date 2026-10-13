import { describe, it, expect } from "vitest";
import request from "supertest";

import { createApp } from "../../app.js";

describe("POST /api/v1/users/login rate limiting", () => {
  it("allows 10 attempts and blocks the 11th attempt", async () => {
    const app = createApp();

    const loginPayload = {
      email: "not-a-valid-user",
      password: "wrong-password"
    };

    const responses = [];

    for (let i = 0; i < 11; i += 1) {
      const response = await request(app)
        .post("/api/v1/users/login")
        .send(loginPayload);

      responses.push(response);
    }

    for (let i = 0; i < 10; i += 1) {
      expect(responses[i].status).not.toBe(429);
    }

    expect(responses[10].status).toBe(429);

    expect(responses[10].body.success).toBe(false);
    expect(responses[10].body.error.code).toBe(
      "AUTH_RATE_LIMIT_EXCEEDED"
    );
  });
});
