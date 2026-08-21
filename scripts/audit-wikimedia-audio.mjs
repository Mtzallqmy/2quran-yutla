const categoryTitle = "Category:Recitations of the Qur'an by Aaqib Azeez";
const endpoint = "https://commons.wikimedia.org/w/api.php";
const allowedLicenses = new Set(["CC BY 4.0", "CC BY-SA 4.0", "CC0", "CC0 1.0", "Public domain"]);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const text = (value) => String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

async function fetchPage(params) {
  const url = new URL(endpoint);
  url.search = new URLSearchParams(params).toString();
  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        "user-agent": "QuranYutlaLicenseAudit/1.0 (rights review; Commons metadata only)",
        accept: "application/json",
      },
    });
    if (response.ok) return response.json();
    lastStatus = response.status;
    if (response.status !== 429 && response.status < 500) break;
    await sleep(1_500 * (attempt + 1));
  }
  throw new Error(`Wikimedia API returned ${lastStatus}`);
}

const baseParams = {
  action: "query",
  format: "json",
  formatversion: "2",
  generator: "categorymembers",
  gcmtitle: categoryTitle,
  gcmtype: "file",
  gcmlimit: "500",
  prop: "imageinfo",
  iiprop: "extmetadata|size|mime|url",
  iiextmetadatafilter: "LicenseShortName|UsageTerms|Artist|Credit|AttributionRequired|ImageDescription|DateTime|FileSource",
};

const pages = [];
let continuation = undefined;
do {
  const payload = await fetchPage({ ...baseParams, ...(continuation ?? {}) });
  pages.push(...(payload.query?.pages ?? []));
  continuation = payload.continue;
  if (continuation) await sleep(600);
} while (continuation);

const files = pages.map((page) => {
  const imageInfo = page.imageinfo?.[0] ?? {};
  const metadata = imageInfo.extmetadata ?? {};
  const valueOf = (name) => text(metadata[name]?.value);
  const surahMatch = page.title.match(/Chapter\s+(\d{1,3})\b/i);
  const license = valueOf("LicenseShortName");
  const credit = valueOf("Credit");
  const author = valueOf("Artist");
  const isOwnWork = /own work/i.test(credit);
  const hasIdentifiedAuthor = Boolean(author);
  const isEligible = allowedLicenses.has(license) && isOwnWork && hasIdentifiedAuthor;

  return {
    title: page.title.replace(/^File:/, ""),
    surah: surahMatch ? Number(surahMatch[1]) : null,
    mode: /mujawwad/i.test(page.title) ? "mujawwad" : /murattal/i.test(page.title) ? "murattal" : "other",
    mime: imageInfo.mime ?? "",
    bytes: imageInfo.size ?? 0,
    license,
    usageTerms: valueOf("UsageTerms"),
    author: valueOf("Artist"),
    credit,
    attributionRequired: valueOf("AttributionRequired"),
    source: valueOf("FileSource"),
    description: valueOf("ImageDescription"),
    url: imageInfo.descriptionurl ?? "",
    reviewStatus: isEligible ? "eligible_pending_import" : "review_required",
    reviewReasons: [
      ...(!allowedLicenses.has(license) ? ["ترخيص غير مدعوم أو غير ظاهر"] : []),
      ...(!isOwnWork ? ["لا يثبت حقل Credit أنه عمل أصلي"] : []),
      ...(!hasIdentifiedAuthor ? ["اسم المؤلف غير ظاهر"] : []),
    ],
  };
});

const eligible = files.filter((file) => file.reviewStatus === "eligible_pending_import");
const grouped = new Map();

for (const file of eligible) {
  if (!file.surah || file.surah < 1 || file.surah > 114) continue;
  const key = `${file.mode}:${file.surah}`;
  grouped.set(key, (grouped.get(key) ?? 0) + 1);
}

const coverage = ["murattal", "mujawwad"].map((mode) => {
  const numbers = Array.from({ length: 114 }, (_, index) => index + 1);
  const covered = numbers.filter((number) => grouped.has(`${mode}:${number}`));
  return {
    mode,
    covered: covered.length,
    missing: numbers.filter((number) => !covered.includes(number)),
    duplicateSurahNumbers: numbers.filter((number) => (grouped.get(`${mode}:${number}`) ?? 0) > 1),
  };
});

const mp3CandidatesByKey = new Map();
for (const file of eligible) {
  if (file.mime !== "audio/mpeg" || !file.surah || file.mode === "other") continue;
  const key = `${file.mode}:${file.surah}`;
  const current = mp3CandidatesByKey.get(key);
  const currentDate = current ? Date.parse(current.dateTime || "") || 0 : 0;
  const nextDate = Date.parse(file.dateTime || "") || 0;
  if (!current || nextDate > currentDate || (nextDate === currentDate && /v2/i.test(file.title) && !/v2/i.test(current.title))) {
    mp3CandidatesByKey.set(key, file);
  }
}
const importCandidates = [...mp3CandidatesByKey.values()].sort((left, right) => (left.surah ?? 0) - (right.surah ?? 0) || left.mode.localeCompare(right.mode));

const summary = {
  category: categoryTitle,
  scannedAt: new Date().toISOString(),
  totalFiles: files.length,
  eligibleFiles: eligible.length,
  reviewRequiredFiles: files.length - eligible.length,
  licenses: Object.fromEntries(
    [...new Set(files.map((file) => file.license || "UNSPECIFIED"))]
      .sort()
      .map((license) => [license, files.filter((file) => (file.license || "UNSPECIFIED") === license).length]),
  ),
  mimeTypes: Object.fromEntries(
    [...new Set(files.map((file) => file.mime || "UNSPECIFIED"))]
      .sort()
      .map((mime) => [mime, files.filter((file) => (file.mime || "UNSPECIFIED") === mime).length]),
  ),
  coverage,
  importCandidateCount: importCandidates.length,
  importCandidatesByMode: Object.fromEntries(["murattal", "mujawwad"].map((mode) => [mode, importCandidates.filter((file) => file.mode === mode).length])),
  importCandidates: importCandidates.map(({ title, surah, mode, license, author, url, bytes }) => ({ title, surah, mode, license, author, url, bytes })),
  eligibleBySurah: eligible
    .filter((file) => file.surah)
    .sort((left, right) => (left.surah ?? 0) - (right.surah ?? 0) || left.mode.localeCompare(right.mode))
    .map(({ title, surah, mode, license, author, url }) => ({ title, surah, mode, license, author, url })),
  reviewRequiredExamples: files
    .filter((file) => file.reviewStatus === "review_required")
    .slice(0, 10)
    .map(({ title, license, reviewReasons, url }) => ({ title, license: license || "UNSPECIFIED", reviewReasons, url })),
};

const output = process.env.AUDIT_SUMMARY_ONLY === "1"
  ? { ...summary, eligibleBySurah: undefined, reviewRequiredExamples: undefined, importCandidates: undefined }
  : summary;

console.log(JSON.stringify(output, null, 2));
