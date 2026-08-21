import { createHash, randomUUID } from "node:crypto";

const workerBaseUrl = () => {
  const value = process.env.EXPO_PUBLIC_MEDIA_API_BASE_URL?.replace(/\/$/, "");
  if (!value) throw new Error("عنوان Worker غير مضبوط على الخادم.");
  return value;
};

const workerToken = () => {
  const value = process.env.MEDIA_WORKER_ADMIN_TOKEN;
  if (!value) throw new Error("رمز إدارة Worker غير مضبوط على الخادم.");
  return value;
};

type WorkerSource = { id: string };
type CommonsMetadata = Record<string, { value?: string }>;
type CommonsPage = { title: string; imageinfo?: Array<{ mime?: string; size?: number; url?: string; descriptionurl?: string; extmetadata?: CommonsMetadata }> };

export type CommonsCandidate = {
  id: string;
  surahNumber: number;
  mode: "murattal" | "mujawwad";
  title: string;
  license: "CC0" | "CC BY-SA 4.0";
  author: string;
  pageUrl: string;
  originalFileUrl: string;
  bytes: number;
  sourceId: string;
  attributionSnapshot: string | null;
};

const stripHtml = (value?: string) => String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const candidateKey = (mode: string, surah: number) => `${mode}:${surah}`;

async function workerJson<T>(path: string, init: RequestInit = {}, admin = false): Promise<T> {
  const response = await fetch(`${workerBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...(admin ? { authorization: `Bearer ${workerToken()}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `تعذر الاتصال بخدمة الوسائط (${response.status}).`);
  return body as T;
}

async function ensureCommonsSource(candidate: CommonsCandidate) {
  const sourceId = candidate.sourceId;
  const known = await workerJson<{ items?: WorkerSource[] }>("/v1/sources");
  if (known.items?.some((source) => source.id === sourceId)) return sourceId;
  const isCcBySa = candidate.license === "CC BY-SA 4.0";
  await workerJson("/v1/admin/sources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: sourceId,
      name: isCcBySa ? "Wikimedia Commons — Aaqib Azeez (CC BY-SA 4.0)" : "Wikimedia Commons — Aaqib Azeez (CC0)",
      officialUrl: candidate.pageUrl,
      termsUrl: isCcBySa ? "https://creativecommons.org/licenses/by-sa/4.0/" : "https://creativecommons.org/publicdomain/zero/1.0/",
      licenseLabel: candidate.license,
      rightsStatus: isCcBySa ? "attribution_required" : "r2_redistribution_allowed",
      streamingAllowed: true,
      downloadAllowed: true,
      r2RedistributionAllowed: true,
      attributionRequired: isCcBySa,
      attributionText: isCcBySa ? "يُحفظ الإسناد الكامل في كل أصل مستورد." : undefined,
      reviewNotes: "مصدر تم إنشاؤه من تدقيق فردي عبر بيانات صفحة ملف Wikimedia Commons الرسمية؛ يقتصر على الملفات التي تظهر العمل الأصلي والمؤلف والترخيص الصريح.",
    }),
  }, true);
  return sourceId;
}

export async function auditAaqibCommons(): Promise<{ scanned: number; candidates: CommonsCandidate[] }> {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query", format: "json", formatversion: "2", generator: "categorymembers",
    gcmtitle: "Category:Recitations of the Qur'an by Aaqib Azeez", gcmtype: "file", gcmlimit: "500",
    prop: "imageinfo", iiprop: "extmetadata|size|mime|url",
    iiextmetadatafilter: "LicenseShortName|Artist|Credit|DateTime",
  }).toString();
  const response = await fetch(url, { headers: { "user-agent": "QuranYutlaAdmin/1.0-rights-review" }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`تعذر الوصول إلى بيانات Commons الرسمية للتدقيق (${response.status}).`);
  const payload = await response.json() as { query?: { pages?: CommonsPage[] } };
  const candidates = new Map<string, CommonsCandidate>();
  for (const page of payload.query?.pages ?? []) {
    const info = page.imageinfo?.[0];
    const metadata = info?.extmetadata ?? {};
    const surahNumber = Number(page.title.match(/Chapter\s+(\d{1,3})\b/i)?.[1]);
    const mode = /mujawwad/i.test(page.title) ? "mujawwad" : /murattal/i.test(page.title) ? "murattal" : null;
    const license = stripHtml(metadata.LicenseShortName?.value);
    const credit = stripHtml(metadata.Credit?.value);
    const author = stripHtml(metadata.Artist?.value);
    if (!mode || !Number.isInteger(surahNumber) || surahNumber < 1 || surahNumber > 114 || info?.mime !== "audio/mpeg" || !info.url || !info.descriptionurl) continue;
    if ((license !== "CC0" && license !== "CC BY-SA 4.0") || !/own work/i.test(credit) || !author) continue;
    const normalizedLicense = license as CommonsCandidate["license"];
    const candidate: CommonsCandidate = {
      id: surahNumber === 1 && mode === "mujawwad" ? "aaqib-azeez-fatiha-mujawwad-v1" : `aaqib-azeez-${mode}-${String(surahNumber).padStart(3, "0")}`,
      surahNumber,
      mode,
      title: page.title.replace(/^File:/, ""),
      license: normalizedLicense,
      author,
      pageUrl: info.descriptionurl,
      originalFileUrl: info.url,
      bytes: Number(info.size ?? 0),
      sourceId: normalizedLicense === "CC0" ? "wikimedia-aaqib-azeez-cc0" : "wikimedia-aaqib-azeez-cc-by-sa-4",
      attributionSnapshot: normalizedLicense === "CC BY-SA 4.0" ? `${author}, ${page.title.replace(/^File:/, "")}, Wikimedia Commons, CC BY-SA 4.0: ${info.descriptionurl}` : null,
    };
    const key = candidateKey(mode, surahNumber);
    const current = candidates.get(key);
    if (!current || /v2/i.test(candidate.title) && !/v2/i.test(current.title)) candidates.set(key, candidate);
  }
  return { scanned: payload.query?.pages?.length ?? 0, candidates: [...candidates.values()].sort((a, b) => a.surahNumber - b.surahNumber || a.mode.localeCompare(b.mode)) };
}

export async function importCommonsCandidate(candidate: CommonsCandidate) {
  if (!candidate.originalFileUrl.startsWith("https://upload.wikimedia.org/")) throw new Error("رابط الملف الأصلي غير معتمد للاستيراد.");
  if (candidate.bytes <= 0 || candidate.bytes > 80 * 1024 * 1024) throw new Error("يتجاوز حجم الملف حد الاستيراد الآمن من لوحة الإدارة (80 MB).");
  const sourceId = await ensureCommonsSource(candidate);
  try {
    await workerJson("/v1/admin/assets", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: candidate.id, sourceId, kind: "quran_surah", title: `تلاوة معتمدة — السورة ${candidate.surahNumber}`,
        description: `${candidate.mode === "mujawwad" ? "مجوّد" : "مرتل"} · ${candidate.license} · ${candidate.author}`,
        reciterId: "aaqib-azeez", reciterName: "Aaqib Azeez",
        moshafId: `aaqib-azeez-${candidate.mode}`, moshafName: candidate.mode === "mujawwad" ? "مجوّد" : "مرتل",
        rewaya: "حفص عن عاصم", surahNumber: candidate.surahNumber, originalUrl: candidate.pageUrl,
        attributionSnapshot: candidate.attributionSnapshot, isDownloadable: true,
      }),
    }, true);
  } catch (error) {
    if (!String(error).includes("معرّف الملف مستخدم بالفعل")) throw error;
    return { status: "already_exists" as const, assetId: candidate.id };
  }
  const sourceResponse = await fetch(candidate.originalFileUrl, { headers: { "user-agent": "QuranYutlaAdmin/1.0-licensed-import" }, signal: AbortSignal.timeout(90_000) });
  if (!sourceResponse.ok || !sourceResponse.headers.get("content-type")?.startsWith("audio/mpeg")) throw new Error("تعذر التحقق من Content-Type لملف MP3 الأصلي.");
  const bytes = Buffer.from(await sourceResponse.arrayBuffer());
  if (bytes.byteLength !== candidate.bytes) throw new Error("حجم الملف المستورد لا يطابق بيانات صفحة المصدر.");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const started = await workerJson<{ sessionId: string; partSize: number }>(`/v1/admin/assets/${candidate.id}/uploads`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ idempotencyKey: randomUUID(), expectedSha256: sha256, expectedBytes: bytes.byteLength, contentType: "audio/mpeg" }),
  }, true);
  for (let offset = 0, part = 1; offset < bytes.byteLength; offset += started.partSize, part += 1) {
    const chunk = bytes.subarray(offset, Math.min(offset + started.partSize, bytes.byteLength));
    const partHash = createHash("sha256").update(chunk).digest("hex");
    await workerJson(`/v1/admin/uploads/${started.sessionId}/parts/${part}`, {
      method: "PUT", headers: { "x-part-sha256": partHash }, body: chunk,
    }, true);
  }
  const completed = await workerJson<{ assetId: string; versionId: string; r2Key: string }>(`/v1/admin/uploads/${started.sessionId}/complete`, {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  }, true);
  return { status: "imported" as const, ...completed, sha256 };
}

export type ManagedSourceInput = {
  id: string; name: string; officialUrl: string; termsUrl: string; licenseLabel: string;
  rightsStatus: "r2_redistribution_allowed" | "attribution_required";
  streamingAllowed: boolean; downloadAllowed: boolean; attributionRequired: boolean;
  attributionText?: string; reviewNotes: string;
};

export async function createManagedSource(input: ManagedSourceInput) {
  return workerJson("/v1/admin/sources", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, r2RedistributionAllowed: true }),
  }, true);
}

export type ManagedAssetInput = {
  id: string; sourceId: string; title: string; description?: string; reciterId: string; reciterName: string;
  moshafId: string; moshafName: string; rewaya?: string; qualityKbps?: number; surahNumber: number;
  originalUrl: string; attributionSnapshot?: string; isDownloadable: boolean;
};

export async function createManagedAsset(input: ManagedAssetInput) {
  return workerJson("/v1/admin/assets", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, kind: "quran_surah" }),
  }, true);
}

export async function uploadManagedAsset(assetId: string, bytes: Buffer, contentType: string, durationMs?: number) {
  if (contentType !== "audio/mpeg") throw new Error("تقبل لوحة الإدارة ملفات MP3 فقط.");
  if (!bytes.byteLength || bytes.byteLength > 80 * 1024 * 1024) throw new Error("حجم الملف يجب أن يكون بين 1 بايت و80 MB.");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const started = await workerJson<{ sessionId: string; partSize: number }>(`/v1/admin/assets/${assetId}/uploads`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ idempotencyKey: randomUUID(), expectedSha256: sha256, expectedBytes: bytes.byteLength, contentType, durationMs }),
  }, true);
  for (let offset = 0, part = 1; offset < bytes.byteLength; offset += started.partSize, part += 1) {
    const chunk = bytes.subarray(offset, Math.min(offset + started.partSize, bytes.byteLength));
    const body = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer;
    await workerJson(`/v1/admin/uploads/${started.sessionId}/parts/${part}`, {
      method: "PUT", headers: { "x-part-sha256": createHash("sha256").update(chunk).digest("hex") }, body,
    }, true);
  }
  const completed = await workerJson<{ assetId: string; versionId: string; r2Key: string }>(`/v1/admin/uploads/${started.sessionId}/complete`, {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  }, true);
  return { ...completed, sha256, bytes: bytes.byteLength };
}

export type ManagedStationInput = {
  id: string;
  title: string;
  description?: string;
  timezone?: string;
  rotationAnchorAt?: string;
  status: "draft" | "published" | "hidden" | "archived";
};

export async function createManagedStation(input: ManagedStationInput) {
  return workerJson("/v1/admin/radio/stations", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
  }, true);
}

export async function addManagedStationItem(stationId: string, input: { assetId: string; sortOrder?: number; isActive?: boolean }) {
  return workerJson(`/v1/admin/radio/stations/${encodeURIComponent(stationId)}/items`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
  }, true);
}

export async function updateManagedAssetPublication(assetId: string, input: { publicationStatus: "draft" | "published" | "hidden" | "archived"; sortOrder?: number }) {
  return workerJson(`/v1/admin/assets/${encodeURIComponent(assetId)}/publication`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
  }, true);
}

export type ManagedReciterInput = { id: string; nameAr: string; nameEn?: string; description?: string; sortOrder?: number; publicationStatus: "draft" | "published" | "hidden" | "archived"; isActive?: boolean };

export async function upsertManagedReciter(input: ManagedReciterInput) {
  return workerJson("/v1/admin/reciters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }, true);
}

export async function uploadManagedReciterImage(reciterId: string, bytes: Buffer, contentType: "image/jpeg" | "image/png" | "image/webp", originalUrl: string, attributionSnapshot?: string) {
  if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024) throw new Error("حجم صورة القارئ يجب أن يكون بين 1 بايت و5 MB.");
  if (!originalUrl.startsWith("https://")) throw new Error("يلزم رابط HTTPS يثبت مصدر صورة القارئ.");
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return workerJson(`/v1/admin/reciters/${encodeURIComponent(reciterId)}/image`, {
    method: "PUT", headers: { "content-type": contentType, "x-original-url": originalUrl, ...(attributionSnapshot ? { "x-attribution-snapshot": attributionSnapshot } : {}) }, body,
  }, true);
}
