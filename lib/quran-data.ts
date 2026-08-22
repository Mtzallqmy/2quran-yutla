export type AudioKind = "station" | "reciter" | "story";

export type AudioItem = {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  streamUrl: string;
  kind: AudioKind;
  color: string;
  durationLabel?: string;
  downloadUrl?: string | null;
  expectedBytes?: number;
  sha256?: string;
  streamType?: "file" | "hls";
};

export const categories = ["الكل", "إذاعات", "تلاوات", "قصص"] as const;

/**
 * لا تحفظ هنا روابط صوتية أو إذاعية من طرف ثالث. تعتمد الواجهة حصريًا على
 * عناصر Worker المفهرسة في D1، التي لا تصبح نشطة إلا بعد التحقق من الحقوق والملف.
 */
export const stations: AudioItem[] = [];
export const reciters: AudioItem[] = [];
export const allAudioItems: AudioItem[] = [];
export const getAudioItem = (_id: string): AudioItem | undefined => undefined;
