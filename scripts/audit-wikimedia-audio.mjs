const categoryTitle = "Category:Recitations of the Qur'an by Aaqib Azeez";
const endpoint = new URL("https://commons.wikimedia.org/w/api.php");

endpoint.search = new URLSearchParams({
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
}).toString();

const response = await fetch(endpoint, {
  headers: { "user-agent": "QuranYutlaLicenseAudit/1.0 (rights-review)" },
});

if (!response.ok) {
  throw new Error(`Wikimedia API returned ${response.status}`);
}

const payload = await response.json();
const files = (payload.query?.pages ?? []).map((page) => {
  const imageInfo = page.imageinfo?.[0] ?? {};
  const metadata = imageInfo.extmetadata ?? {};
  const valueOf = (name) => metadata[name]?.value?.replace(/<[^>]+>/g, " ").trim() ?? "";
  const surahMatch = page.title.match(/Chapter\s+(\d{1,3})\b/i);

  return {
    title: page.title.replace(/^File:/, ""),
    surah: surahMatch ? Number(surahMatch[1]) : null,
    mode: /mujawwad/i.test(page.title) ? "mujawwad" : /murattal/i.test(page.title) ? "murattal" : "other",
    mime: imageInfo.mime ?? "",
    bytes: imageInfo.size ?? 0,
    license: valueOf("LicenseShortName"),
    usageTerms: valueOf("UsageTerms"),
    author: valueOf("Artist"),
    credit: valueOf("Credit"),
    attributionRequired: valueOf("AttributionRequired"),
    source: valueOf("FileSource"),
    description: valueOf("ImageDescription"),
    url: imageInfo.descriptionurl ?? "",
  };
});

const permittedLicenses = new Set([
  "CC BY 4.0",
  "CC BY-SA 4.0",
  "CC0 1.0",
  "Public domain",
]);

const eligible = files.filter((file) => permittedLicenses.has(file.license));
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

const summary = {
  category: categoryTitle,
  scannedAt: new Date().toISOString(),
  totalFiles: files.length,
  eligibleFiles: eligible.length,
  licenses: Object.fromEntries(
    [...new Set(files.map((file) => file.license || "UNSPECIFIED"))]
      .sort()
      .map((license) => [license, files.filter((file) => (file.license || "UNSPECIFIED") === license).length]),
  ),
  coverage,
  nonEligibleExamples: files
    .filter((file) => !permittedLicenses.has(file.license))
    .slice(0, 10)
    .map(({ title, license, url }) => ({ title, license: license || "UNSPECIFIED", url })),
};

console.log(JSON.stringify(summary, null, 2));
