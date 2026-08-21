import { describe, expect, it } from "vitest";

describe("Worker administration credential", () => {
  it("authorizes a non-mutating validation request without exposing the token", async () => {
    const baseUrl = process.env.EXPO_PUBLIC_MEDIA_API_BASE_URL?.replace(/\/$/, "");
    const token = process.env.MEDIA_WORKER_ADMIN_TOKEN;
    expect(baseUrl).toMatch(/^https:\/\//);
    expect(token).toMatch(/^[a-f0-9]{64}$/);

    const response = await fetch(`${baseUrl}/v1/admin/sources`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: "{}",
    });
    expect(response.status).toBe(422);
  }, 20_000);
});
