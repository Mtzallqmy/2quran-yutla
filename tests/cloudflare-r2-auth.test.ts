import { describe, expect, it } from "vitest";

describe("Cloudflare R2 credentials", () => {
  it("can list the target account buckets without exposing credentials", async () => {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    expect(token).toBeTruthy();
    expect(accountId).toMatch(/^[a-f0-9]{32}$/i);

    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets?per_page=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok).toBe(true);
    const body = await response.json() as { success?: boolean };
    expect(body.success).toBe(true);
  }, 20_000);
});
