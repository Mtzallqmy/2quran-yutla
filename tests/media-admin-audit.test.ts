import { afterEach, describe, expect, it, vi } from "vitest";

import { auditAaqibCommons, updateManagedAssetPublication } from "../server/media-admin";

describe("Wikimedia Commons media audit", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("returns only individual MP3 candidates with explicit approved licensing metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ query: { pages: [{ title: "File:Chapter 1, Al-Fatiha (Mujawwad) - Recitation of the Holy Qur'an.mp3", imageinfo: [{ mime: "audio/mpeg", size: 1234, url: "https://upload.wikimedia.org/example.mp3", descriptionurl: "https://commons.wikimedia.org/wiki/File:Example", extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" }, Artist: { value: "Aaqib Azeez" }, Credit: { value: "Own work" } } }] }] } }), { status: 200 })));
    const result = await auditAaqibCommons();
    expect(result.scanned).toBe(1);
    expect(result.candidates).toHaveLength(1);
    for (const item of result.candidates) {
      expect(item.surahNumber).toBeGreaterThanOrEqual(1);
      expect(item.surahNumber).toBeLessThanOrEqual(114);
      expect(["CC0", "CC BY-SA 4.0"]).toContain(item.license);
      expect(item.originalFileUrl).toMatch(/^https:\/\/upload\.wikimedia\.org\//);
      expect(item.pageUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      expect(item.bytes).toBeGreaterThan(0);
    }
  }, 30_000);

  it("ينفذ اعتماد النشر كخطوة مستقلة بعد الرفع", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "approved-audio", publicationStatus: "published" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await updateManagedAssetPublication("approved-audio", { publicationStatus: "published" });
    expect(result).toMatchObject({ id: "approved-audio", publicationStatus: "published" });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/v1\/admin\/assets\/approved-audio\/publication$/), expect.objectContaining({ method: "PATCH" }));
  });
});
