import { describe, expect, it } from "vitest";

import { buildApprovedQuranCatalog, getSurahAudioItem, type Surah } from "../lib/quran-catalog";
import { allAudioItems, reciters, stations } from "../lib/quran-data";
import type { R2MediaAsset } from "../lib/r2-media-client";

const fatiha: Surah = { number: 1, name: "الفاتحة", englishName: "Al-Fatiha", numberOfAyahs: 7, revelationType: "Meccan" };
const approvedAsset: R2MediaAsset = {
  id: "aaqib-fatiha-mujawwad",
  kind: "quran_surah",
  title: "الفاتحة",
  description: "Wikimedia Commons · CC BY-SA 4.0",
  reciterId: "aaqib-azeez",
  reciterName: "Aaqib Azeez",
  surahNumber: 1,
  durationMs: 77_000,
  isDownloadable: true,
  bytes: 1_386_546,
  sha256: "a".repeat(64),
  streamUrl: "https://quran-yutla-media.example/v1/media/aaqib-fatiha-mujawwad/stream",
  downloadUrl: "https://quran-yutla-media.example/v1/media/aaqib-fatiha-mujawwad/download",
};

describe("quran catalog", () => {
  it("does not retain hard-coded third-party audio items", () => {
    expect(stations).toEqual([]);
    expect(reciters).toEqual([]);
    expect(allAudioItems).toEqual([]);
  });

  it("builds a reciter catalog exclusively from approved R2/D1 assets", () => {
    const catalog = buildApprovedQuranCatalog([fatiha], [approvedAsset], "2026-08-21T00:00:00.000Z");
    expect(catalog.source).toBe("Cloudflare R2/D1");
    expect(catalog.approvedAssetCount).toBe(1);
    expect(catalog.reciters).toHaveLength(1);
    expect(catalog.reciters[0].availableSurahIds).toEqual([1]);
    expect(getSurahAudioItem(catalog.reciters[0], fatiha)?.streamUrl).toBe(approvedAsset.streamUrl);
  });
});
