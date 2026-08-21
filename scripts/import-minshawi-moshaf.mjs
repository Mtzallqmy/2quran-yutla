import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const workerBase = (process.env.MEDIA_WORKER_BASE_URL ?? "https://quran-yutla-media.mtzallqmy.workers.dev").replace(/\/$/, "");
const adminToken = process.env.MEDIA_WORKER_ADMIN_TOKEN;
const category = "Category:Recitations of the Qur'an by Al Minshawi";
const importLimit = Math.max(1, Math.min(Number(process.env.IMPORT_LIMIT ?? "1"), 114));
const importStartSurah = Math.max(1, Math.min(Number(process.env.IMPORT_START_SURAH ?? "1"), 114));
const delayMs = Math.max(1_500, Number(process.env.IMPORT_DELAY_MS ?? "2500"));
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
      if (attempt < 4) {
        await sleep(attempt * 5_000);
        continue;
      }
      throw error;
    }
    const body = await response.json().catch(() => ({}));
    if (response.ok) return body;
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 4) {
      await sleep(attempt * 4_000);
      continue;
    }
    throw new Error(`${path}: ${body.error ?? response.statusText}`);
  }
  throw new Error(`${path}: تعذر تنفيذ الطلب بعد إعادة المحاولة.`);
}

async function commonsFiles() {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "categorymembers",
    gcmtitle: category,
    gcmtype: "file",
    gcmlimit: "500",
    prop: "imageinfo",
    iiprop: "extmetadata|size|mime|url|sha1",
    iiextmetadatafilter: "LicenseShortName|Artist|Credit|License|UsageTerms",
  }).toString();
  const response = await fetch(url, { headers: { "user-agent": userAgent }, signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`تعذر تحميل فهرس Commons (${response.status}).`);
  const payload = await response.json();
  return payload.query?.pages ?? [];
}

async function ensureSource() {
  const source = {
    id: "wikimedia-al-minshawi-pd-egypt",
    name: "Wikimedia Commons — محمد صديق المنشاوي (PD-Egypt)",
    officialUrl: "https://commons.wikimedia.org/wiki/Category:Recitations_of_the_Qur%27an_by_Al_Minshawi",
    termsUrl: "https://commons.wikimedia.org/wiki/Template:PD-Egypt",
    licenseLabel: "Public Domain — PD-Egypt",
    rightsStatus: "r2_redistribution_allowed",
    streamingAllowed: true,
    downloadAllowed: true,
    r2RedistributionAllowed: true,
    attributionRequired: false,
    attributionText: "محمد صديق المنشاوي — التسجيل في الملكية العامة وفق وسم PD-Egypt في صفحة ملف Wikimedia Commons الفردية.",
    reviewNotes: "يقبل المستورد فقط ملفات Sura Minshawi 1..114 بصيغة OGG عندما تعلن بيانات صفحة الملف الفردية رخصة PD-Egypt أو Public Domain، ثم يحفظ رابط المصدر والبصمة ويرفع نسخة MP3 متحولة للبث المتوافق مع iOS وAndroid.",
  };
  try {
    await worker("/v1/admin/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(source) });
  } catch (error) {
    if (!String(error).includes("UNIQUE constraint failed")) throw error;
  }
  return source.id;
}

function isPublicDomainEgypt(metadata) {
  const license = plainText(metadata.LicenseShortName?.value);
  const detail = `${plainText(metadata.License?.value)} ${plainText(metadata.UsageTerms?.value)}`;
  return /pd[-\s]?egypt|public domain|\bpd\b/i.test(`${license} ${detail}`);
}

function candidateFromPage(page) {
  const info = page.imageinfo?.[0];
  const title = page.title.replace(/^File:/, "");
  const surahNumber = Number(title.match(/^Sura Minshawi (\d{1,3})\.ogg$/i)?.[1]);
  const metadata = info?.extmetadata ?? {};
  if (!Number.isInteger(surahNumber) || surahNumber < 1 || surahNumber > 114) return null;
  if (!['audio/ogg', 'application/ogg'].includes(info?.mime) || !info?.url || !info?.descriptionurl || !info?.size || !info?.sha1) return null;
  if (!isPublicDomainEgypt(metadata)) return null;
  return {
    title,
    surahNumber,
    sourceBytes: Number(info.size),
    sourceSha1: String(info.sha1).toLowerCase(),
    fileUrl: info.url,
    pageUrl: info.descriptionurl,
    author: plainText(metadata.Artist?.value) || "Mohamed Siddiq El-Minshawi",
    license: "PD-Egypt / Public Domain",
  };
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} فشل (${code}): ${stderr.slice(-800)}`)));
  });
}

async function downloadTo(url, output) {
  const response = await fetch(url, { headers: { "user-agent": userAgent }, signal: AbortSignal.timeout(180_000) });
  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after") ?? "غير محدد";
    throw new Error(`Wikimedia Commons حدّ الطلبات (HTTP 429؛ Retry-After: ${retryAfter}). أوقفت الاستيراد دون إنشاء أصل جديد.`);
  }
  if (!response.ok || !response.body) throw new Error(`تعذر تنزيل الملف المصدر (HTTP ${response.status}).`);
  const chunks = [];
  for await (const chunk of response.body) chunks.push(Buffer.from(chunk));
  await writeFile(output, Buffer.concat(chunks));
}

async function importCandidate(candidate, sourceId) {
  const workDir = await mkdtemp(join(tmpdir(), "quran-yutla-minshawi-"));
  const oggPath = join(workDir, `${candidate.surahNumber}.ogg`);
  const mp3Path = join(workDir, `${candidate.surahNumber}.mp3`);
  try {
    await downloadTo(candidate.fileUrl, oggPath);
    const source = await readFile(oggPath);
    if ((await stat(oggPath)).size !== candidate.sourceBytes) throw new Error(`سورة ${candidate.surahNumber}: الحجم لا يطابق صفحة المصدر.`);
    const sha1 = createHash("sha1").update(source).digest("hex");
    if (sha1 !== candidate.sourceSha1) throw new Error(`سورة ${candidate.surahNumber}: بصمة SHA-1 للمصدر لا تطابق صفحة Wikimedia.`);
    await run("ffmpeg", ["-nostdin", "-y", "-i", oggPath, "-vn", "-codec:a", "libmp3lame", "-b:a", "128k", "-map_metadata", "-1", mp3Path]);
    const bytes = await readFile(mp3Path);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const assetId = `al-minshawi-murattal-${String(candidate.surahNumber).padStart(3, "0")}`;
    let reusedDraft = false;
    try {
      await worker("/v1/admin/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: assetId,
          sourceId,
          kind: "quran_surah",
          title: `سورة ${candidate.surahNumber} — مرتل`,
          description: `محمد صديق المنشاوي · ${candidate.license} · تحويل تقني من OGG إلى MP3 128 kbps`,
          reciterId: "mohamed-siddiq-al-minshawi",
          reciterName: "محمد صديق المنشاوي",
          moshafId: "al-minshawi-murattal-pd-egypt",
          moshafName: "مرتل — ملكية عامة (PD-Egypt)",
          rewaya: "حفص عن عاصم",
          qualityKbps: 128,
          surahNumber: candidate.surahNumber,
          originalUrl: candidate.pageUrl,
          attributionSnapshot: `${candidate.author}, ${candidate.title}, Wikimedia Commons, ${candidate.license}; converted from OGG to MP3 by Quran Yutla for platform compatibility: ${candidate.pageUrl}`,
          isDownloadable: true,
        }),
      });
    } catch (error) {
      if (String(error).includes("مستخدم بالفعل")) reusedDraft = true;
      else throw error;
    }
    const started = await worker(`/v1/admin/assets/${assetId}/uploads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: randomUUID(), expectedSha256: sha256, expectedBytes: bytes.byteLength, contentType: "audio/mpeg" }),
    });
    for (let offset = 0, part = 1; offset < bytes.byteLength; offset += started.partSize, part += 1) {
      const chunk = bytes.subarray(offset, Math.min(offset + started.partSize, bytes.byteLength));
      await worker(`/v1/admin/uploads/${started.sessionId}/parts/${part}`, {
        method: "PUT",
        headers: { "x-part-sha256": createHash("sha256").update(chunk).digest("hex") },
        body: chunk,
      });
    }
    const completed = await worker(`/v1/admin/uploads/${started.sessionId}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    return { assetId, status: reusedDraft ? "resumed_draft" : "imported", sourceBytes: candidate.sourceBytes, bytes: bytes.byteLength, sourceSha1: candidate.sourceSha1, sha256, pageUrl: candidate.pageUrl, ...completed };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

const pages = await commonsFiles();
const candidates = pages.map(candidateFromPage).filter(Boolean).sort((a, b) => a.surahNumber - b.surahNumber);
const expectedNumbers = new Set(Array.from({ length: 114 }, (_, index) => index + 1));
const unique = [...new Map(candidates.map((item) => [item.surahNumber, item])).values()];
const missing = [...expectedNumbers].filter((number) => !unique.some((item) => item.surahNumber === number));

if (process.env.IMPORT_DRY_RUN === "1") {
  console.log(JSON.stringify({ candidates: unique.length, missing, items: unique.map(({ surahNumber, title, license, sourceBytes, pageUrl }) => ({ surahNumber, title, license, sourceBytes, pageUrl })) }, null, 2));
  process.exit(0);
}

const sourceId = await ensureSource();
const results = [];
const selected = unique.filter((candidate) => candidate.surahNumber >= importStartSurah).slice(0, importLimit);
for (let index = 0; index < selected.length; index += 1) {
  const candidate = selected[index];
  results.push(await importCandidate(candidate, sourceId));
  if (index < selected.length - 1) await sleep(delayMs);
}
console.log(JSON.stringify({ sourceId, candidates: unique.length, missing, importStartSurah, importLimit, results }, null, 2));
