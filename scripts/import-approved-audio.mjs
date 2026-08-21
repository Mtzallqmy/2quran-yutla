import { createHash, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

const workerBaseUrl = process.env.MEDIA_WORKER_BASE_URL?.replace(/\/$/, "");
const adminToken = process.env.MEDIA_WORKER_ADMIN_TOKEN;
const filePath = process.env.APPROVED_AUDIO_FILE;

if (!workerBaseUrl || !adminToken || !filePath) {
  throw new Error("MEDIA_WORKER_BASE_URL وMEDIA_WORKER_ADMIN_TOKEN وAPPROVED_AUDIO_FILE مطلوبة للاستيراد.");
}

const source = {
  id: "wikimedia-aaqib-fatiha-cc-by-sa-4",
  name: "Wikimedia Commons — Aaqib Azeez, Al-Fatiha (Mujawwad)",
  officialUrl: "https://commons.wikimedia.org/wiki/File:Chapter_1,_Al-Fatiha_(Mujawwad)_-_Recitation_of_the_Holy_Qur%27an.mp3",
  termsUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  licenseLabel: "CC BY-SA 4.0",
  rightsStatus: "attribution_required",
  streamingAllowed: true,
  downloadAllowed: true,
  r2RedistributionAllowed: true,
  attributionRequired: true,
  attributionText: "Aaqib Azeez, Chapter 1, Al-Fatiha (Mujawwad) — Recitation of the Holy Qur'an, Wikimedia Commons, CC BY-SA 4.0: https://commons.wikimedia.org/wiki/File:Chapter_1,_Al-Fatiha_(Mujawwad)_-_Recitation_of_the_Holy_Qur%27an.mp3",
  reviewNotes: "تمت مراجعة صفحة الملف في 2026-08-21: العمل مذكور كعمل أصلي للمؤلف Atcovi/Aaqib Azeez وممنوح صراحةً تحت CC BY-SA 4.0. يقتصر هذا السجل على ملف الفاتحة (مجوّد) ولا يمتد إلى باقي الفئة.",
};

const asset = {
  id: "aaqib-azeez-fatiha-mujawwad-v1",
  sourceId: source.id,
  kind: "quran_surah",
  title: "سورة الفاتحة — مجوّد",
  description: "تلاوة سورة الفاتحة بصوت Aaqib Azeez · Wikimedia Commons · CC BY-SA 4.0",
  reciterId: "aaqib-azeez",
  reciterName: "Aaqib Azeez",
  surahNumber: 1,
  isDownloadable: true,
};

async function request(path, options = {}) {
  const response = await fetch(`${workerBaseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${adminToken}`,
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} failed (${response.status}): ${body.error ?? "unknown error"}`);
  return body;
}

const bytes = await readFile(filePath);
const fileStats = await stat(filePath);
const sha256 = createHash("sha256").update(bytes).digest("hex");

try {
  await request("/v1/admin/sources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(source),
  });
} catch (error) {
  if (!String(error).includes("UNIQUE constraint failed")) throw error;
}

const created = await request("/v1/admin/assets", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(asset),
});

const upload = await request(`/v1/admin/assets/${created.id}/uploads`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    idempotencyKey: randomUUID(),
    expectedSha256: sha256,
    expectedBytes: fileStats.size,
    contentType: "audio/mpeg",
    durationMs: 76_944,
  }),
});

await request(`/v1/admin/uploads/${upload.sessionId}/parts/1`, {
  method: "PUT",
  headers: { "x-part-sha256": sha256 },
  body: bytes,
});

const completed = await request(`/v1/admin/uploads/${upload.sessionId}/complete`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});

console.log(JSON.stringify({ sourceId: source.id, assetId: completed.assetId, versionId: completed.versionId, r2Key: completed.r2Key, sha256, bytes: fileStats.size }, null, 2));
