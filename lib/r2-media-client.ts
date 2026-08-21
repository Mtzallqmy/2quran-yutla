import type { AudioItem, AudioKind } from "./quran-data";

export type R2MediaAsset = {
  id: string;
  kind: "quran_surah" | "radio_program" | "lecture" | "recording" | "jingle";
  title: string;
  description?: string | null;
  reciterId?: string | null;
  reciterName?: string | null;
  moshafId?: string | null;
  moshafName?: string | null;
  rewaya?: string | null;
  qualityKbps?: number | null;
  surahNumber?: number | null;
  originalUrl?: string | null;
  bitrateKbps?: number | null;
  durationMs?: number | null;
  isDownloadable: number | boolean;
  bytes: number;
  sha256: string;
  contentVersion?: number;
  updatedAt?: string;
  streamUrl: string;
  downloadUrl?: string | null;
};

export type RadioStation = { id: string; title: string; description?: string | null; artworkStorageKey?: string | null; timezone: string; rotationAnchorAt: string; contentVersion: number; updatedAt: string; playlistCount: number };
export type RadioStationNow = {
  station: { id: string; title: string; description?: string | null; timezone: string; contentVersion: number };
  now: { asset: R2MediaAsset; startOffsetMs: number; startsAt: string; endsAt: string };
  next: { asset: R2MediaAsset };
  serverTime: string;
};
export type ContentManifest = { revision: string | null; counts: { reciters: number; moshafs: number; assets: number; stations: number } };

export type R2ContentSource = {
  id: string;
  name: string;
  officialUrl: string;
  termsUrl: string;
  licenseLabel: string;
  rightsStatus: "r2_redistribution_allowed" | "stream_link_only" | "attribution_required" | "permission_required" | "review_required" | "prohibited";
  streamingAllowed: number | boolean;
  downloadAllowed: number | boolean;
  r2RedistributionAllowed: number | boolean;
  attributionRequired: number | boolean;
  attributionText?: string | null;
  reviewedAt?: string | null;
};

const palette = ["#0D7869", "#B8842D", "#3C6E8F", "#8D5F47", "#637E51", "#755E9C"];
const colorFor = (value: string) => palette[Array.from(value).reduce((total, char) => total + char.charCodeAt(0), 0) % palette.length];

export function mediaApiBaseUrl() {
  const base = process.env.EXPO_PUBLIC_MEDIA_API_BASE_URL?.replace(/\/$/, "");
  if (!base) throw new Error("لم تُضبط خدمة مكتبة R2 بعد. أضف EXPO_PUBLIC_MEDIA_API_BASE_URL بعد نشر Worker.");
  return base;
}

export async function fetchR2Media(kind?: R2MediaAsset["kind"], reciterId?: string) {
  const url = new URL(`${mediaApiBaseUrl()}/v1/media`);
  if (kind) url.searchParams.set("kind", kind);
  if (reciterId) url.searchParams.set("reciterId", reciterId);
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error("تعذر تحميل فهرس المكتبة الصوتية المعتمدة من R2.");
  const body = await response.json() as { items?: R2MediaAsset[] };
  return body.items ?? [];
}

export async function fetchR2ContentSources() {
  const response = await fetch(`${mediaApiBaseUrl()}/v1/sources`);
  if (!response.ok) throw new Error("تعذر تحميل سجل حقوق المحتوى.");
  const body = await response.json() as { items?: R2ContentSource[] };
  return body.items ?? [];
}

export async function fetchRadioStations() {
  const response = await fetch(`${mediaApiBaseUrl()}/v1/radio/stations`);
  if (!response.ok) throw new Error("تعذر تحميل محطات إذاعة التطبيق.");
  const body = await response.json() as { items?: RadioStation[] };
  return body.items ?? [];
}

export async function fetchContentManifest(etag?: string | null) {
  const response = await fetch(`${mediaApiBaseUrl()}/v1/content/manifest`, { headers: etag ? { "if-none-match": etag } : {}, cache: "no-store" });
  if (response.status === 304) return { notModified: true as const, etag: response.headers.get("etag") ?? etag ?? null, manifest: null };
  if (!response.ok) throw new Error("تعذر التحقق من إصدار فهرس المحتوى.");
  return { notModified: false as const, etag: response.headers.get("etag"), manifest: await response.json() as ContentManifest };
}

export async function fetchRadioStationNow(stationId: string) {
  const response = await fetch(`${mediaApiBaseUrl()}/v1/radio/stations/${encodeURIComponent(stationId)}/now`, { cache: "no-store" });
  if (!response.ok) throw new Error("تعذر تحميل البرنامج الجاري للمحطة.");
  return response.json() as Promise<RadioStationNow>;
}

export function toAudioItem(asset: R2MediaAsset): AudioItem {
  const kind: AudioKind = asset.kind === "quran_surah" ? "reciter" : asset.kind === "radio_program" || asset.kind === "jingle" ? "station" : "story";
  const reciter = asset.reciterName || asset.reciterId;
  return {
    id: asset.id,
    title: asset.title,
    subtitle: asset.description || (reciter ? `${reciter}${asset.moshafName ? ` · ${asset.moshafName}` : ""} · السورة ${asset.surahNumber}` : "ملف مفهرس من المكتبة المركزية"),
    category: kind === "reciter" ? "تلاوات" : kind === "station" ? "إذاعات" : "محتوى صوتي",
    streamUrl: asset.streamUrl,
    kind,
    color: colorFor(asset.id),
    durationLabel: asset.surahNumber ? `السورة ${asset.surahNumber}` : undefined,
    downloadUrl: asset.downloadUrl,
    expectedBytes: Number(asset.bytes),
    sha256: asset.sha256,
  };
}

export async function verifyRemoteMedia(item: AudioItem) {
  const response = await fetch(item.streamUrl, { method: "HEAD" });
  if (!response.ok) throw new Error("الملف المفهرس غير متاح الآن.");
  const bytes = Number(response.headers.get("content-length") ?? 0);
  const sha256 = response.headers.get("x-content-sha256") ?? "";
  if (item.expectedBytes && bytes && bytes !== item.expectedBytes) throw new Error("حجم الملف لا يطابق الفهرس المعتمد.");
  if (item.sha256 && sha256 && sha256 !== item.sha256) throw new Error("بصمة الملف لا تطابق الفهرس المعتمد.");
  return { bytes, sha256 };
}
