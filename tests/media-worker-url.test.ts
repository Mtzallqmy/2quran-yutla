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
    expect(streamResponse.status).toBe(200);
    expect(streamResponse.headers.get("accept-ranges")).toBe("bytes");
    expect(streamResponse.headers.get("x-content-sha256")).toBe(asset?.sha256);
    expect(Number(streamResponse.headers.get("content-length"))).toBeGreaterThan(0);
    const rangeResponse = await fetch(asset!.streamUrl!, { headers: { range: "bytes=0-1023" } });
    expect(rangeResponse.status).toBe(206);
    expect(rangeResponse.headers.get("content-range")).toMatch(/^bytes 0-1023\//);
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

  it("serves the D1 surah catalog and the scheduled app radio with conditional caching", async () => {
    const baseUrl = process.env.EXPO_PUBLIC_MEDIA_API_BASE_URL!.replace(/\/$/, "");
    const surahsResponse = await fetch(`${baseUrl}/v1/quran/surahs`);
    expect(surahsResponse.ok).toBe(true);
    const surahs = await surahsResponse.json() as { items?: Array<{ number?: number; name?: string }> };
    expect(surahs.items).toHaveLength(114);
    expect(surahs.items?.[0]?.number).toBe(1);

    const stationsResponse = await fetch(`${baseUrl}/v1/radio/stations`);
    expect(stationsResponse.ok).toBe(true);
    const etag = stationsResponse.headers.get("etag");
    expect(etag).toMatch(/^(W\/)?"quran-yutla-/);
    const stations = await stationsResponse.json() as { items?: Array<{ id?: string }> };
    expect(stations.items?.some((station) => station.id === "quran-yutla-radio")).toBe(true);

    const cachedResponse = await fetch(`${baseUrl}/v1/radio/stations`, { headers: { "if-none-match": etag ?? "" } });
    expect(cachedResponse.status).toBe(304);
    const manifestResponse = await fetch(`${baseUrl}/v1/content/manifest`);
    expect(manifestResponse.ok).toBe(true);
    const manifestEtag = manifestResponse.headers.get("etag");
    const manifest = await manifestResponse.json() as { counts?: { assets?: number; stations?: number } };
    expect(manifest.counts?.assets).toBeGreaterThanOrEqual(258);
    expect(manifest.counts?.stations).toBeGreaterThanOrEqual(1);
    const manifestCached = await fetch(`${baseUrl}/v1/content/manifest`, { headers: { "if-none-match": manifestEtag ?? "" } });
    expect(manifestCached.status).toBe(304);
    const nowResponse = await fetch(`${baseUrl}/v1/radio/stations/quran-yutla-radio/now`);
    expect(nowResponse.ok).toBe(true);
    const now = await nowResponse.json() as { now?: { asset?: { id?: string; streamUrl?: string }; startOffsetMs?: number }; next?: { asset?: { id?: string } } };
    expect(now.now?.asset?.id).toBeTruthy();
    expect(now.now?.asset?.streamUrl).toContain("/v1/media/");
    expect(now.now?.startOffsetMs).toBeGreaterThanOrEqual(0);
    expect(now.next?.asset?.id).toBeTruthy();
  }, 20_000);

  it("rejects radio administration without the Worker admin token", async () => {
    const baseUrl = process.env.EXPO_PUBLIC_MEDIA_API_BASE_URL!.replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/v1/admin/radio/stations`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "unauthorized-test", title: "محطة اختبار" }),
    });
    expect(response.status).toBe(401);
  }, 20_000);

  it("exposes a cacheable HLS channel index and rejects unauthenticated HLS changes", async () => {
    const baseUrl = process.env.EXPO_PUBLIC_MEDIA_API_BASE_URL!.replace(/\/$/, "");
    const indexResponse = await fetch(`${baseUrl}/v1/live/hls-channels`);
    expect(indexResponse.ok).toBe(true);
    const etag = indexResponse.headers.get("etag");
    const index = await indexResponse.json() as { items?: unknown[] };
    expect(Array.isArray(index.items)).toBe(true);
    const cachedIndex = await fetch(`${baseUrl}/v1/live/hls-channels`, { headers: { "if-none-match": etag ?? "" } });
    expect(cachedIndex.status).toBe(304);
    const unauthorized = await fetch(`${baseUrl}/v1/admin/live/hls-channels`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "unauthorized-hls", title: "قناة اختبار", sourceId: "none", manifestUrl: "https://example.org/live.m3u8", status: "draft" }),
    });
    expect(unauthorized.status).toBe(401);
  }, 20_000);
});
