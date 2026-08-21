import { writeFile } from "node:fs/promises";

const output = process.argv[2];
if (!output) throw new Error("Usage: node scripts/build-surah-seed.mjs <output.json>");

const response = await fetch("https://api.alquran.cloud/v1/surah");
if (!response.ok) throw new Error(`Surah source responded with ${response.status}`);
const payload = await response.json();
const surahs = Array.isArray(payload.data) ? payload.data : [];
if (surahs.length !== 114) throw new Error(`Expected 114 surahs, received ${surahs.length}`);

const escape = (value) => String(value ?? "").replace(/'/g, "''");
const values = surahs.map((surah) => {
  const number = Number(surah.number);
  const ayahs = Number(surah.numberOfAyahs);
  const revelation = String(surah.revelationType).toLowerCase() === "medinan" ? "medinan" : "meccan";
  if (!Number.isInteger(number) || number < 1 || number > 114 || !Number.isInteger(ayahs) || ayahs < 1 || !surah.name) throw new Error(`Invalid surah row ${number}`);
  return `(${number}, '${escape(surah.name)}', '${escape(surah.englishName)}', ${ayahs}, '${revelation}', CURRENT_TIMESTAMP)`;
});
const sql = `INSERT INTO surahs (number, name_ar, name_en, ayah_count, revelation_type, updated_at) VALUES\n${values.join(",\n")}\nON CONFLICT(number) DO UPDATE SET name_ar = excluded.name_ar, name_en = excluded.name_en, ayah_count = excluded.ayah_count, revelation_type = excluded.revelation_type, updated_at = CURRENT_TIMESTAMP;`;
await writeFile(output, JSON.stringify({ database_id: "0f1669ce-f610-4fbb-81b1-d454a042660c", sql }), "utf8");
console.log(`Prepared ${surahs.length} verified surahs for D1.`);
