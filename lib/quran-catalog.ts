import { fetchR2Media, toAudioItem, type R2MediaAsset } from "./r2-media-client";
import type { AudioItem } from "./quran-data";

export type Surah = { number: number; name: string; englishName: string; numberOfAyahs: number; revelationType: "Meccan" | "Medinan" };
export type Reciter = {
  id: string;
  name: string;
  moshafs: Moshaf[];
  defaultMoshafId: string;
  availableSurahIds: number[];
  surahAssets: Record<number, R2MediaAsset>;
  source: "Cloudflare R2/D1";
};
export type Moshaf = {
  id: string;
  name: string;
  rewaya?: string | null;
  qualityKbps?: number | null;
  availableSurahIds: number[];
  surahAssets: Record<number, R2MediaAsset>;
};
export type AudioProgram = {
  id: string;
  name: string;
  asset: R2MediaAsset;
  source: "Cloudflare R2/D1";
};
export type QuranCatalog = {
  source: "Cloudflare R2/D1";
  surahs: Surah[];
  reciters: Reciter[];
  radios: AudioProgram[];
  approvedAssetCount: number;
  loadedAt: string;
};

const SURAH_API = "https://api.alquran.cloud/v1/surah";

function normalizeSurahs(payload: { data?: Surah[] }) {
  return (payload.data ?? [])
    .filter((surah) => Number.isInteger(surah.number) && surah.number >= 1 && surah.number <= 114 && Boolean(surah.name))
    .sort((left, right) => left.number - right.number);
}

export function buildApprovedQuranCatalog(surahs: Surah[], assets: R2MediaAsset[], loadedAt = new Date().toISOString()): QuranCatalog {
  const reciters = new Map<string, Reciter>();

  for (const asset of assets) {
    const surahNumber = Number(asset.surahNumber);
    const reciterId = asset.reciterId?.trim();
    const reciterName = asset.reciterName?.trim();
    const moshafId = asset.moshafId?.trim() || `${reciterId}-default`;
    if (asset.kind !== "quran_surah" || !reciterId || !reciterName || !Number.isInteger(surahNumber) || surahNumber < 1 || surahNumber > 114) continue;

    const existing = reciters.get(reciterId) ?? {
      id: reciterId,
      name: reciterName,
      moshafs: [],
      defaultMoshafId: moshafId,
      availableSurahIds: [],
      surahAssets: {},
      source: "Cloudflare R2/D1" as const,
    };
    const moshaf = existing.moshafs.find((item) => item.id === moshafId) ?? {
      id: moshafId,
      name: asset.moshafName?.trim() || "مصحف معتمد",
      rewaya: asset.rewaya,
      qualityKbps: asset.qualityKbps,
      availableSurahIds: [],
      surahAssets: {},
    };
    if (!moshaf.surahAssets[surahNumber]) {
      moshaf.surahAssets[surahNumber] = asset;
      moshaf.availableSurahIds.push(surahNumber);
    }
    if (!existing.moshafs.some((item) => item.id === moshafId)) existing.moshafs.push(moshaf);
    reciters.set(reciterId, existing);
  }

  const approvedReciters = Array.from(reciters.values())
    .map((reciter) => {
      const moshafs = reciter.moshafs
        .map((moshaf) => ({ ...moshaf, availableSurahIds: moshaf.availableSurahIds.sort((left, right) => left - right) }))
        .sort((left, right) => left.name.localeCompare(right.name, "ar"));
      const defaultMoshaf = moshafs.find((moshaf) => moshaf.id === reciter.defaultMoshafId) ?? moshafs[0];
      return {
        ...reciter,
        moshafs,
        defaultMoshafId: defaultMoshaf.id,
        availableSurahIds: defaultMoshaf.availableSurahIds,
        surahAssets: defaultMoshaf.surahAssets,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "ar"));

  const radios = assets
    .filter((asset) => asset.kind === "radio_program" || asset.kind === "jingle")
    .map((asset) => ({ id: asset.id, name: asset.title, asset, source: "Cloudflare R2/D1" as const }));

  return {
    source: "Cloudflare R2/D1",
    surahs: [...surahs].sort((left, right) => left.number - right.number),
    reciters: approvedReciters,
    radios,
    approvedAssetCount: assets.length,
    loadedAt,
  };
}

export function getSurahAudioItem(reciter: Reciter, surah: Surah, moshafId?: string): AudioItem {
  const moshaf = reciter.moshafs.find((item) => item.id === moshafId) ?? reciter.moshafs.find((item) => item.id === reciter.defaultMoshafId);
  const asset = moshaf?.surahAssets[surah.number];
  if (!asset) throw new Error("السورة غير موجودة في فهرس الأصول المعتمدة لهذا القارئ.");
  return toAudioItem(asset);
}

export function getRadioAudioItem(program: AudioProgram): AudioItem {
  return toAudioItem(program.asset);
}

export function findApprovedAudioItem(catalog: QuranCatalog | null, assetId: string): AudioItem | undefined {
  if (!catalog) return undefined;
  for (const reciter of catalog.reciters) {
    for (const moshaf of reciter.moshafs) {
      for (const asset of Object.values(moshaf.surahAssets)) {
        if (asset.id === assetId) return toAudioItem(asset);
      }
    }
  }
  const program = catalog.radios.find((item) => item.asset.id === assetId);
  return program ? toAudioItem(program.asset) : undefined;
}

export async function fetchQuranCatalog(): Promise<QuranCatalog> {
  const [surahResponse, assets] = await Promise.all([fetch(SURAH_API), fetchR2Media()]);
  if (!surahResponse.ok) throw new Error("تعذر تحميل فهرس سور القرآن.");
  const surahs = normalizeSurahs(await surahResponse.json() as { data?: Surah[] });
  if (surahs.length !== 114) throw new Error("مصدر فهرس السور أعاد بيانات غير مكتملة؛ لم يتم اعتمادها داخل التطبيق.");
  return buildApprovedQuranCatalog(surahs, assets);
}
