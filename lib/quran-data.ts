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
};

export const categories = ["الكل", "إذاعات", "تلاوات", "قصص"] as const;

export const stations: AudioItem[] = [
  { id: "quran-live", title: "إذاعة القرآن الكريم", subtitle: "بث متواصل من التلاوات المختارة", category: "إذاعات", streamUrl: "https://qurango.net/radio/tarateel", kind: "station", color: "#0D7869" },
  { id: "haram-radio", title: "إذاعة الحرم المكي", subtitle: "بث مباشر للذكر والتلاوات", category: "إذاعات", streamUrl: "https://r7.tarat.com:8004/;", kind: "station", color: "#B8842D" },
  { id: "radiojar-quran", title: "تلاوات مختارة", subtitle: "قراءة هادئة على مدار اليوم", category: "إذاعات", streamUrl: "https://stream.radiojar.com/0tpy1h0kxtzuv", kind: "station", color: "#3C6E8F" },
  { id: "sahabah-stories", title: "قصص الصحابة", subtitle: "رحلة إيمانية صوتية قصيرة", category: "قصص", streamUrl: "https://backup.qurango.net/radio/sahabah", kind: "story", color: "#8D5F47" },
];

export const reciters: AudioItem[] = [
  { id: "abdulbasit", title: "عبد الباسط عبد الصمد", subtitle: "تلاوات مرتلة مختارة", category: "تلاوات", streamUrl: "https://server7.mp3quran.net/basit/001.mp3", kind: "reciter", color: "#2A806C", durationLabel: "114 سورة" },
  { id: "minshawi", title: "محمد صديق المنشاوي", subtitle: "تلاوة خاشعة ومؤثرة", category: "تلاوات", streamUrl: "https://server10.mp3quran.net/minsh/001.mp3", kind: "reciter", color: "#9A7038", durationLabel: "114 سورة" },
  { id: "husary", title: "محمود خليل الحصري", subtitle: "المصحف المرتل", category: "تلاوات", streamUrl: "https://server13.mp3quran.net/husr/001.mp3", kind: "reciter", color: "#637E51", durationLabel: "114 سورة" },
  { id: "sudais", title: "عبد الرحمن السديس", subtitle: "من تلاوات الحرم المكي", category: "تلاوات", streamUrl: "https://server11.mp3quran.net/sds/001.mp3", kind: "reciter", color: "#3B6E89", durationLabel: "114 سورة" },
];

export const allAudioItems = [...stations, ...reciters];
export const getAudioItem = (id: string) => allAudioItems.find((item) => item.id === id);
