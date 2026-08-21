import { describe, expect, it } from "vitest";

import { getSurahAudioItem, type Reciter, type Surah } from "../lib/quran-catalog";

describe("Quran catalog compatibility", () => {
  it("does not crash when an old cached reciter has no moshafs property", () => {
    const surah: Surah = { number: 1, name: "الفاتحة", englishName: "Al-Fatiha", numberOfAyahs: 7, revelationType: "Meccan" };
    const legacyReciter = {
      id: "legacy", name: "قارئ سابق", availableSurahIds: [1], source: "Cloudflare R2/D1",
      surahAssets: { 1: { id: "legacy-fatiha", kind: "quran_surah", title: "الفاتحة", reciterId: "legacy", reciterName: "قارئ سابق", surahNumber: 1, isDownloadable: true, bytes: 1, sha256: "hash", streamUrl: "https://example.test/audio.mp3" } },
    } as unknown as Reciter;
    expect(getSurahAudioItem(legacyReciter, surah).id).toBe("legacy-fatiha");
  });
});
