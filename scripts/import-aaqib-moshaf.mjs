import { createHash, randomUUID } from "node:crypto";

const workerBase = (process.env.MEDIA_WORKER_BASE_URL ?? "https://quran-yutla-media.mtzallqmy.workers.dev").replace(/\/$/, "");
const adminToken = process.env.MEDIA_WORKER_ADMIN_TOKEN;
const category = "Category:Recitations of the Qur'an by Aaqib Azeez";
const importLimit = Math.max(1, Math.min(Number(process.env.IMPORT_LIMIT ?? "1"), 144));
const importOffset = Math.max(0, Number(process.env.IMPORT_OFFSET ?? "0"));
const importMode = ["murattal", "mujawwad"].includes(process.env.IMPORT_MODE ?? "") ? process.env.IMPORT_MODE : null;
const importStartSurah = Math.max(1, Math.min(Number(process.env.IMPORT_START_SURAH ?? "1"), 114));
const delayMs = Math.max(1_500, Number(process.env.IMPORT_DELAY_MS ?? "5000"));
const userAgent = "QuranYutlaRightsImport/1.0 (licensed-audio archival; contact: admin@quran-yutla.app)";

if (!adminToken) throw new Error("MEDIA_WORKER_ADMIN_TOKEN مطلوب للاستيراد الإداري.");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const plainText = (value) => String(value ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

async function worker(path, init = {}) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    let response;
    try {
      response = await fetch(`${workerBase}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${adminToken}`, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(180_000),
      });
    } catch (error) {
      if (attempt < 4) { await sleep(attempt * 5_000); continue; }
      throw error;
    }
    const body = await response.json().catch(() => ({}));
    if (response.ok) return body;
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 4) {
      await sleep(attempt * 5_000);
      continue;
    }
    throw new Error(`${path}: ${body.error ?? response.statusText}`);
  }
  throw new Error(`${path}: تعذر تنفيذ الطلب بعد إعادة المحاولة.`);
}

async function commonsFiles() {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query", format: "json", formatversion: "2", generator: "categorymembers", gcmtitle: category, gcmtype: "file", gcmlimit: "500",
    prop: "imageinfo", iiprop: "extmetadata|size|mime|url|sha1", iiextmetadatafilter: "LicenseShortName|Artist|Credit|DateTime",
  }).toString();
  const response = await fetch(url, { headers: { "user-agent": userAgent }, signal: AbortSignal.timeout(45_000) });
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
    reviewNotes: "ملفات MP3 فردية من عمل Aaqib Azeez الأصلي كما يذكرها Wikimedia Commons. يقبل المستورد فقط CC0 أو CC BY-SA 4.0، ويحفظ الإسناد والبصمة والرابط لكل أصل.",
  };
  try {
    await worker("/v1/admin/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(source) });
  } catch (error) {
    if (!String(error).includes("UNIQUE constraint failed")) throw error;
  }
  return source.id;
}

function candidateFromPage(page) {
  const info = page.imageinfo?.[0];
  const metadata = info?.extmetadata ?? {};
  const title = page.title.replace(/^File:/, "");
  const surahNumber = Number(title.match(/Chapter\s+(\d{1,3})\b/i)?.[1]);
  const mode = /mujawwad/i.test(title) ? "mujawwad" : /murattal/i.test(title) ? "murattal" : null;
  const license = plainText(metadata.LicenseShortName?.value);
  const author = plainText(metadata.Artist?.value);
  const ownWork = /own work/i.test(plainText(metadata.Credit?.value));
  if (!Number.isInteger(surahNumber) || surahNumber < 1 || surahNumber > 114 || !mode) return null;
  if (info?.mime !== "audio/mpeg" || !info?.url || !info?.descriptionurl || !info?.size || !info?.sha1) return null;
  if (!ownWork || !author || !["CC0", "CC BY-SA 4.0"].includes(license)) return null;
  return { title, surahNumber, mode, license, author, sourceBytes: Number(info.size), sourceSha1: String(info.sha1).toLowerCase(), fileUrl: info.url, pageUrl: info.descriptionurl, timestamp: Date.parse(plainText(metadata.DateTime?.value)) || 0 };
}

async function download(candidate) {
  const response = await fetch(candidate.fileUrl, { headers: { "user-agent": userAgent }, signal: AbortSignal.timeout(180_000) });
  if (response.status === 429) throw new Error(`Wikimedia Commons حدّ الطلبات (HTTP 429؛ Retry-After: ${response.headers.get("retry-after") ?? "غير محدد"}). أوقفت الاستيراد دون إنشاء أصل جديد.`);
  if (!response.ok || !response.body) throw new Error(`${candidate.title}: تعذر تنزيل MP3 المصدر (HTTP ${response.status}).`);
  const chunks = [];
  for await (const chunk of response.body) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  if (bytes.byteLength !== candidate.sourceBytes) throw new Error(`${candidate.title}: الحجم لا يطابق صفحة المصدر.`);
  const sha1 = createHash("sha1").update(bytes).digest("hex");
  if (sha1 !== candidate.sourceSha1) throw new Error(`${candidate.title}: بصمة SHA-1 للمصدر لا تطابق بيانات Wikimedia.`);
  return bytes;
}

async function importCandidate(candidate) {
  const sourceId = await ensureSource(candidate.license, candidate.pageUrl);
  const assetId = `aaqib-azeez-${candidate.mode}-${String(candidate.surahNumber).padStart(3, "0")}`;
  const moshafId = `aaqib-azeez-${candidate.mode}`;
  const moshafName = candidate.mode === "mujawwad" ? "مجوّد — تلاوات مرخصة" : "مرتل — تلاوات مرخصة";
  const bytes = await download(candidate);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  try {
    await worker("/v1/admin/assets", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: assetId, sourceId, kind: "quran_surah", title: `سورة ${candidate.surahNumber} — ${candidate.mode === "mujawwad" ? "مجوّد" : "مرتل"}`,
        description: `Aaqib Azeez · ${candidate.license} · Wikimedia Commons`, reciterId: "aaqib-azeez", reciterName: "Aaqib Azeez",
        moshafId, moshafName, rewaya: "حفص عن عاصم", surahNumber: candidate.surahNumber, originalUrl: candidate.pageUrl,
        attributionSnapshot: candidate.license === "CC BY-SA 4.0" ? `${candidate.author}, ${candidate.title}, Wikimedia Commons, CC BY-SA 4.0: ${candidate.pageUrl}` : `${candidate.author}, ${candidate.title}, Wikimedia Commons, CC0: ${candidate.pageUrl}`,
        isDownloadable: true,
      }),
    });
  } catch (error) {
    if (!String(error).includes("مستخدم بالفعل") && !String(error).includes("UNIQUE constraint failed")) throw error;
  }
  const started = await worker(`/v1/admin/assets/${assetId}/uploads`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ idempotencyKey: randomUUID(), expectedSha256: sha256, expectedBytes: bytes.byteLength, contentType: "audio/mpeg" }),
  });
  for (let offset = 0, part = 1; offset < bytes.byteLength; offset += started.partSize, part += 1) {
    const chunk = bytes.subarray(offset, Math.min(offset + started.partSize, bytes.byteLength));
    await worker(`/v1/admin/uploads/${started.sessionId}/parts/${part}`, { method: "PUT", headers: { "x-part-sha256": createHash("sha256").update(chunk).digest("hex") }, body: chunk });
  }
  const completed = await worker(`/v1/admin/uploads/${started.sessionId}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  return { assetId, status: "imported", bytes: bytes.byteLength, sha256, pageUrl: candidate.pageUrl, ...completed };
}

const pages = await commonsFiles();
const raw = pages.map(candidateFromPage).filter(Boolean);
const selectedByKey = new Map();
for (const candidate of raw) {
  const key = `${candidate.mode}:${candidate.surahNumber}`;
  const existing = selectedByKey.get(key);
  const candidateIsV2 = /\bv2\b/i.test(candidate.title);
  const existingIsV2 = /\bv2\b/i.test(existing?.title ?? "");
  if (!existing || candidate.timestamp > existing.timestamp || (candidate.timestamp === existing.timestamp && candidateIsV2 && !existingIsV2)) selectedByKey.set(key, candidate);
}
const candidates = [...selectedByKey.values()]
  .filter((item) => !(item.mode === "mujawwad" && item.surahNumber === 1))
  .sort((a, b) => a.mode.localeCompare(b.mode) || a.surahNumber - b.surahNumber);

if (process.env.IMPORT_DRY_RUN === "1") {
  console.log(JSON.stringify({ rawCandidates: raw.length, candidates: candidates.length, byMode: Object.fromEntries(["murattal", "mujawwad"].map((mode) => [mode, candidates.filter((item) => item.mode === mode).length])), items: candidates.map(({ surahNumber, mode, license, title, pageUrl }) => ({ surahNumber, mode, license, title, pageUrl })) }, null, 2));
  process.exit(0);
}

const selected = candidates
  .filter((candidate) => !importMode || candidate.mode === importMode)
  .filter((candidate) => candidate.surahNumber >= importStartSurah)
  .slice(importOffset, importOffset + importLimit);
const results = [];
for (let index = 0; index < selected.length; index += 1) {
  results.push(await importCandidate(selected[index]));
  if (index < selected.length - 1) await sleep(delayMs);
}
console.log(JSON.stringify({ candidates: candidates.length, importMode, importStartSurah, importOffset, importLimit, results }, null, 2));
