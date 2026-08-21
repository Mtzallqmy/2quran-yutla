import { createHash, randomUUID } from "node:crypto";

const workerBase = (process.env.MEDIA_WORKER_BASE_URL ?? "https://quran-yutla-media.mtzallqmy.workers.dev").replace(/\/$/, "");
const adminToken = process.env.MEDIA_WORKER_ADMIN_TOKEN;
const category = "Category:Recitations of the Qur'an by Aaqib Azeez";
const targetSurahs = new Set(Array.from({ length: 15 }, (_, index) => index + 100));
const importLimit = Math.max(1, Math.min(Number(process.env.IMPORT_LIMIT ?? "1"), 15));

if (!adminToken) throw new Error("MEDIA_WORKER_ADMIN_TOKEN مطلوب للاستيراد الإداري.");

const plainText = (value) => String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

async function worker(path, init = {}) {
  const response = await fetch(`${workerBase}${path}`, { ...init, headers: { authorization: `Bearer ${adminToken}`, ...(init.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${body.error ?? response.statusText}`);
  return body;
}

async function commonsFiles() {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({ action: "query", format: "json", formatversion: "2", generator: "categorymembers", gcmtitle: category, gcmtype: "file", gcmlimit: "500", prop: "imageinfo", iiprop: "extmetadata|size|mime|url", iiextmetadatafilter: "LicenseShortName|Artist|Credit" }).toString();
  const response = await fetch(url, { headers: { "user-agent": "QuranYutlaRightsImport/1.0" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`تعذر تحميل فهرس Commons (${response.status}).`);
  const payload = await response.json();
  return payload.query?.pages ?? [];
}

async function ensureSource(license, samplePage) {
  const isCc0 = license === "CC0";
  const source = {
    id: isCc0 ? "wikimedia-aaqib-azeez-cc0" : "wikimedia-aaqib-azeez-cc-by-sa-4",
    name: isCc0 ? "Wikimedia Commons — Aaqib Azeez (CC0)" : "Wikimedia Commons — Aaqib Azeez (CC BY-SA 4.0)",
    officialUrl: samplePage,
    termsUrl: isCc0 ? "https://creativecommons.org/publicdomain/zero/1.0/" : "https://creativecommons.org/licenses/by-sa/4.0/",
    licenseLabel: isCc0 ? "CC0" : "CC BY-SA 4.0",
    rightsStatus: isCc0 ? "r2_redistribution_allowed" : "attribution_required",
    streamingAllowed: true,
    downloadAllowed: true,
    r2RedistributionAllowed: true,
    attributionRequired: !isCc0,
    attributionText: isCc0 ? undefined : "الإسناد التفصيلي محفوظ داخل كل تلاوة مستوردة.",
    reviewNotes: "ملفات MP3 فردية من عمل Aaqib Azeez الأصلي وفق بيانات Wikimedia Commons، تم تدقيق الترخيص واسم المؤلف ووسم العمل الأصلي قبل الاستيراد.",
  };
  try { await worker("/v1/admin/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(source) }); } catch (error) { if (!String(error).includes("UNIQUE constraint failed")) throw error; }
  return source.id;
}

async function importCandidate(candidate) {
  const sourceId = await ensureSource(candidate.license, candidate.pageUrl);
  const assetId = `aaqib-azeez-mujawwad-${String(candidate.surahNumber).padStart(3, "0")}`;
  const source = await fetch(candidate.fileUrl, { headers: { "user-agent": "QuranYutlaRightsImport/1.0" }, signal: AbortSignal.timeout(60_000) });
  const contentType = source.headers.get("content-type")?.toLowerCase() ?? "";
  if (!source.ok || (!contentType.startsWith("audio/mpeg") && !contentType.startsWith("application/octet-stream"))) throw new Error(`${assetId}: تعذر تنزيل ملف MP3 الأصلي (HTTP ${source.status}, ${contentType || "بلا نوع"}).`);
  const bytes = Buffer.from(await source.arrayBuffer());
  if (bytes.byteLength !== candidate.bytes) throw new Error(`${assetId}: الحجم لا يطابق صفحة المصدر.`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  try {
    await worker("/v1/admin/assets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: assetId, sourceId, kind: "quran_surah", title: `سورة ${candidate.surahNumber} — مجوّد`, description: `Aaqib Azeez · ${candidate.license} · Wikimedia Commons`, reciterId: "aaqib-azeez", reciterName: "Aaqib Azeez", moshafId: "aaqib-azeez-mujawwad", moshafName: "مجوّد — سور قصيرة مرخصة", rewaya: "حفص عن عاصم", surahNumber: candidate.surahNumber, originalUrl: candidate.pageUrl, attributionSnapshot: candidate.license === "CC BY-SA 4.0" ? `${candidate.author}, ${candidate.title}, Wikimedia Commons, CC BY-SA 4.0: ${candidate.pageUrl}` : null, isDownloadable: true }) });
  } catch (error) {
    if (String(error).includes("مستخدم بالفعل")) return { assetId, status: "already_exists" };
    throw error;
  }
  const started = await worker(`/v1/admin/assets/${assetId}/uploads`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idempotencyKey: randomUUID(), expectedSha256: sha256, expectedBytes: bytes.byteLength, contentType: "audio/mpeg" }) });
  for (let offset = 0, part = 1; offset < bytes.byteLength; offset += started.partSize, part += 1) {
    const chunk = bytes.subarray(offset, Math.min(offset + started.partSize, bytes.byteLength));
    await worker(`/v1/admin/uploads/${started.sessionId}/parts/${part}`, { method: "PUT", headers: { "x-part-sha256": createHash("sha256").update(chunk).digest("hex") }, body: chunk });
  }
  const completed = await worker(`/v1/admin/uploads/${started.sessionId}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  return { assetId, status: "imported", bytes: bytes.byteLength, ...completed };
}

const pages = await commonsFiles();
const candidates = pages.map((page) => {
  const info = page.imageinfo?.[0]; const metadata = info?.extmetadata ?? {}; const title = page.title.replace(/^File:/, ""); const surahNumber = Number(title.match(/Chapter\s+(\d{1,3})\b/i)?.[1]); const license = plainText(metadata.LicenseShortName?.value); const author = plainText(metadata.Artist?.value); const ownWork = /own work/i.test(plainText(metadata.Credit?.value));
  return { title, surahNumber, license, author, ownWork, mime: info?.mime, bytes: Number(info?.size ?? 0), fileUrl: info?.url, pageUrl: info?.descriptionurl };
}).filter((item) => targetSurahs.has(item.surahNumber) && /mujawwad/i.test(item.title) && item.mime === "audio/mpeg" && item.fileUrl && item.pageUrl && item.ownWork && item.author && ["CC0", "CC BY-SA 4.0"].includes(item.license)).sort((a, b) => a.surahNumber - b.surahNumber);

const unique = [...new Map(candidates.map((item) => [item.surahNumber, item])).values()];
if (process.env.IMPORT_DRY_RUN === "1") {
  console.log(JSON.stringify({ requestedSurahs: [...targetSurahs], candidates: unique.map(({ surahNumber, title, license, bytes, fileUrl, pageUrl }) => ({ surahNumber, title, license, bytes, fileUrl, pageUrl })) }, null, 2));
  process.exit(0);
}
const results = [];
for (const candidate of unique.slice(0, importLimit)) results.push(await importCandidate(candidate));
console.log(JSON.stringify({ requestedSurahs: [...targetSurahs], candidates: unique.length, importLimit, results }, null, 2));
