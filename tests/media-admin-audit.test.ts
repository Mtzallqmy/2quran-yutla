import { afterEach, describe, expect, it, vi } from "vitest";

import { auditAaqibCommons } from "../server/media-admin";

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
});
