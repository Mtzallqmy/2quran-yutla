import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

import type { AudioItem } from "@/lib/quran-data";

export type DownloadedAudio = { id: string; title: string; subtitle: string; localUri: string; size: number; downloadedAt: string };
const KEY = "quran-yutla:downloads-v1";
const directory = `${FileSystem.documentDirectory}quran-yutla-audio/`;
const safeName = (id: string) => id.replace(/[^a-zA-Z0-9-]/g, "_");

export async function listDownloads(): Promise<DownloadedAudio[]> {
  const saved = await AsyncStorage.getItem(KEY); if (!saved) return [];
  try { return JSON.parse(saved) as DownloadedAudio[]; } catch { return []; }
}
async function saveDownloads(items: DownloadedAudio[]) { await AsyncStorage.setItem(KEY, JSON.stringify(items)); }

export async function downloadAudio(item: AudioItem): Promise<DownloadedAudio> {
  if (!FileSystem.documentDirectory) throw new Error("التنزيلات غير متاحة على هذه المنصة.");
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  if (!item.downloadUrl) throw new Error("هذا الملف غير متاح للتنزيل من المكتبة المركزية.");
  const localUri = `${directory}${safeName(item.id)}.mp3`;
  const existing = await FileSystem.getInfoAsync(localUri);
  const records = await listDownloads();
  if (existing.exists) {
    const stored = records.find((record) => record.id === item.id);
    if (stored) return stored;
  }
  const temporaryUri = `${localUri}.part`;
  const result = await FileSystem.downloadAsync(item.downloadUrl, temporaryUri, { headers: { "x-quran-yutla-download": "1" } });
  const info = await FileSystem.getInfoAsync(result.uri) as { exists: boolean; size?: number };
  if (!info.exists || !info.size) throw new Error("فشل التحقق من ملف التنزيل.");
  if (item.expectedBytes && info.size !== item.expectedBytes) { await FileSystem.deleteAsync(temporaryUri, { idempotent: true }); throw new Error("حجم الملف المنزّل لا يطابق الفهرس المعتمد."); }
  await FileSystem.moveAsync({ from: temporaryUri, to: localUri });
  const record: DownloadedAudio = { id: item.id, title: item.title, subtitle: item.subtitle, localUri, size: info.size, downloadedAt: new Date().toISOString() };
  await saveDownloads([record, ...records.filter((current) => current.id !== item.id)]);
  return record;
}

export async function deleteDownload(id: string) {
  const records = await listDownloads(); const record = records.find((item) => item.id === id);
  if (record) { const info = await FileSystem.getInfoAsync(record.localUri); if (info.exists) await FileSystem.deleteAsync(record.localUri, { idempotent: true }); }
  await saveDownloads(records.filter((item) => item.id !== id));
}
