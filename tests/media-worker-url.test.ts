import { describe, expect, it } from "vitest";

describe("Cloudflare media Worker public endpoint", () => {
  it("uses the configured public media endpoint and receives a healthy response", async () => {
    const baseUrl = process.env.EXPO_PUBLIC_MEDIA_API_BASE_URL;
    expect(baseUrl).toMatch(/^https:\/\//);

    const response = await fetch(`${baseUrl!.replace(/\/$/, "")}/health`);
    expect(response.ok).toBe(true);
    const body = await response.json() as { ok?: boolean };
    expect(body.ok).toBe(true);
  }, 20_000);

  it("exposes the approved asset with a verifiable stream response", async () => {
    const baseUrl = process.env.EXPO_PUBLIC_MEDIA_API_BASE_URL!.replace(/\/$/, "");
    const catalogResponse = await fetch(`${baseUrl}/v1/media`);
    expect(catalogResponse.ok).toBe(true);
    const catalog = await catalogResponse.json() as { items?: Array<{ id?: string; reciterName?: string; sha256?: string; streamUrl?: string }> };
    const asset = catalog.items?.find((item) => item.id === "aaqib-azeez-fatiha-mujawwad-v1");
    expect(asset?.reciterName).toBe("Aaqib Azeez");
    expect(asset?.sha256).toMatch(/^[a-f0-9]{64}$/);

    const streamResponse = await fetch(asset!.streamUrl!, { method: "HEAD" });
    expect(streamResponse.ok).toBe(true);
    expect(streamResponse.headers.get("accept-ranges")).toBe("bytes");
    expect(streamResponse.headers.get("x-content-sha256")).toBe(asset?.sha256);
  }, 20_000);

  it("records the Shuraim publisher as permission-required rather than an approved R2 source", async () => {
    const baseUrl = process.env.EXPO_PUBLIC_MEDIA_API_BASE_URL!.replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/v1/sources`);
    expect(response.ok).toBe(true);
    const body = await response.json() as { items?: { id?: string; rightsStatus?: string; r2RedistributionAllowed?: number | boolean }[] };
    const source = body.items?.find((item) => item.id === "haramain-saud-al-shuraim");
    expect(source?.rightsStatus).toBe("permission_required");
    expect(Boolean(source?.r2RedistributionAllowed)).toBe(false);
  }, 20_000);
});
