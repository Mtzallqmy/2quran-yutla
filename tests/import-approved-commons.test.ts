import { describe, expect, it } from "vitest";

import { importCommonsCandidate, type CommonsCandidate } from "../server/media-admin";

describe("approved Commons import", () => {
  it("imports an individually audited MP3 and treats a repeat as idempotent", async () => {
    const candidate: CommonsCandidate = { id: "aaqib-azeez-fatiha-mujawwad-v1", surahNumber: 1, mode: "mujawwad", title: "Chapter 1, Al-Fatiha (Mujawwad)", license: "CC BY-SA 4.0", author: "Aaqib Azeez", pageUrl: "https://commons.wikimedia.org/wiki/File:Chapter_1,_Al-Fatiha_(Mujawwad)_-_Recitation_of_the_Holy_Qur%27an.mp3", originalFileUrl: "https://upload.wikimedia.org/wikipedia/commons/example.mp3", bytes: 1, sourceId: "wikimedia-aaqib-azeez-cc-by-sa-4", attributionSnapshot: "Aaqib Azeez, Chapter 1, Wikimedia Commons, CC BY-SA 4.0" };
    const result = await importCommonsCandidate(candidate);
    expect(["imported", "already_exists"]).toContain(result.status);
    expect(result.assetId).toBe(candidate.id);
  }, 120_000);
});
