import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { ArtworkOrb } from "@/components/artwork-orb";
import { AudioCard } from "@/components/audio-card";
import { SectionHeading } from "@/components/section-heading";
import { ScreenContainer } from "@/components/screen-container";
import { getRadioAudioItem, getSurahAudioItem } from "@/lib/quran-catalog";
import { usePlayer } from "@/lib/player-context";
import { useQuranContent } from "@/lib/quran-content-context";
import type { AudioItem } from "@/lib/quran-data";
import { useQuranTheme } from "@/lib/quran-theme";

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useQuranTheme();
  const { catalog, loading } = useQuranContent();
  const { current, isPlaying, recentIds, resumePositions, playItem, togglePlayback } = usePlayer();
  const approvedItems = useMemo<AudioItem[]>(() => {
    if (!catalog) return [];
    const recitationItems = catalog.reciters.flatMap((reciter) => {
      const firstSurah = catalog.surahs.find((surah) => reciter.availableSurahIds.includes(surah.number));
      const item = firstSurah ? getSurahAudioItem(reciter, firstSurah) : null;
      return item ? [item] : [];
    });
    return [...recitationItems, ...catalog.radios.map(getRadioAudioItem)];
  }, [catalog]);
  const recent = useMemo(() => recentIds.map((id) => approvedItems.find((item) => item.id === id)).filter((item): item is AudioItem => Boolean(item)), [approvedItems, recentIds]);
  const currentIsApproved = Boolean(current && approvedItems.some((item) => item.id === current.id));
  const resumedItem = recent.find((item) => (resumePositions[item.id]?.positionSeconds ?? 0) > 3);
  const resume = currentIsApproved ? current : resumedItem ?? recent[0] ?? approvedItems[0];
  const displayed = recent.length ? recent : approvedItems.slice(0, 2);
  const startPlayback = () => {
    if (currentIsApproved && current) return void togglePlayback();
    if (resume) return void playItem(resume);
  };

  return <ScreenContainer style={{ backgroundColor: colors.background }}><FlatList data={displayed} keyExtractor={(item) => item.id} renderItem={({ item }) => <AudioCard item={item} compact />} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
    ListEmptyComponent={loading ? <View style={styles.loading}><ActivityIndicator color={colors.emerald} /></View> : <View style={[styles.empty, { backgroundColor: colors.surfaceMuted }]}><MaterialCommunityIcons name="shield-check-outline" size={28} color={colors.gold} /><Text style={[styles.emptyText, { color: colors.textMuted }]}>لا توجد تلاوات متاحة الآن. لن يُعرض إلا المحتوى الذي تم التحقق من مصدره.</Text></View>}
    ListHeaderComponent={<View>
      <View style={styles.topline}><View style={[styles.mark, { backgroundColor: colors.goldSoft }]}><MaterialCommunityIcons name="book-open-page-variant" size={20} color={colors.gold} /></View><View style={styles.titleBlock}><Text style={[styles.brand, { color: colors.text }]}>قرآن يتلى</Text><Text style={[styles.by, { color: colors.textMuted }]}>من تطوير معتز العلقمي</Text></View></View>
      <View style={[styles.hero, { backgroundColor: colors.emerald }]}><Text style={styles.heroGlyph}>۞</Text><Text style={styles.eyebrow}>رفيقك اليومي للاستماع</Text><Text style={styles.heroTitle}>افتح قلبك{`\n`}لتلاوة تلامس الروح</Text><Pressable disabled={!resume} onPress={startPlayback} style={({ pressed }) => [styles.heroAction, !resume && styles.disabled, pressed && resume && styles.pressed]}><MaterialCommunityIcons name={currentIsApproved && isPlaying ? "pause" : "play"} size={21} color={colors.emerald} /><Text style={[styles.heroActionText, { color: colors.emerald }]}>{currentIsApproved && isPlaying ? "إيقاف مؤقت" : resume ? "ابدأ الاستماع" : "بانتظار مصدر معتمد"}</Text></Pressable></View>
      {resume ? <Pressable onPress={startPlayback} style={({ pressed }) => [styles.resume, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}><View style={[styles.resumePlay, { backgroundColor: colors.emerald }]}><MaterialCommunityIcons name={currentIsApproved && isPlaying ? "pause" : "play"} size={22} color="#FFF" /></View><View style={styles.resumeCopy}><Text style={[styles.resumeLabel, { color: colors.gold }]}>{(resumePositions[resume.id]?.positionSeconds ?? 0) > 3 ? "أكمل من آخر موضع" : "استمع الآن"}</Text><Text numberOfLines={1} style={[styles.resumeTitle, { color: colors.text }]}>{resume.title}</Text><Text numberOfLines={1} style={[styles.resumeSub, { color: colors.textMuted }]}>{resume.subtitle}</Text></View><ArtworkOrb color={resume.color} kind={resume.kind} size={48} /></Pressable> : null}
      <View style={styles.shortcuts}>{[["المكتبة الإذاعية", "radio", "/(tabs)/listen"], ["القراء", "account-voice", "/(tabs)/reciters"], ["مكتبتي", "heart-outline", "/(tabs)/library"]].map(([label, icon, path]) => <Pressable key={label} onPress={() => router.push(path as never)} style={({ pressed }) => [styles.shortcut, { backgroundColor: colors.surfaceMuted }, pressed && styles.pressed]}><MaterialCommunityIcons name={icon as never} size={22} color={colors.emerald} /><Text style={[styles.shortcutText, { color: colors.text }]}>{label}</Text></Pressable>)}</View>
      <View style={styles.section}><SectionHeading eyebrow="استمرارك" title={recent.length ? "استمعت إليها مؤخرًا" : "محتوى معتمد"} /></View>
    </View>}
    ListFooterComponent={approvedItems[0] ? <View style={styles.footer}><SectionHeading eyebrow="اختيار من الفهرس" title="تلاوة معتمدة" /><AudioCard item={approvedItems[0]} /></View> : null} />
  </ScreenContainer>;
}
const styles = StyleSheet.create({ content: { padding: 18, paddingBottom: 178 }, topline: { flexDirection: "row-reverse", alignItems: "center", marginBottom: 18 }, mark: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center" }, titleBlock: { flex: 1, alignItems: "flex-end", marginRight: 10 }, brand: { fontSize: 23, lineHeight: 29, fontWeight: "900" }, by: { fontSize: 11, lineHeight: 17 }, hero: { minHeight: 220, borderRadius: 30, padding: 24, overflow: "hidden", alignItems: "flex-end", justifyContent: "center" }, heroGlyph: { position: "absolute", left: -10, top: -36, color: "rgba(255,255,255,.15)", fontSize: 210, lineHeight: 220 }, eyebrow: { color: "#D7F4EA", fontSize: 12, fontWeight: "800", marginBottom: 8 }, heroTitle: { color: "#FFF", fontSize: 29, lineHeight: 38, textAlign: "right", fontWeight: "900" }, heroAction: { marginTop: 18, height: 46, borderRadius: 16, paddingHorizontal: 16, backgroundColor: "#FFF", flexDirection: "row-reverse", gap: 7, alignItems: "center" }, heroActionText: { fontSize: 13, fontWeight: "900" }, disabled: { opacity: .65 }, resume: { marginTop: 14, padding: 12, borderRadius: 24, borderWidth: 1, flexDirection: "row-reverse", alignItems: "center" }, resumePlay: { width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center" }, resumeCopy: { flex: 1, alignItems: "flex-end", marginHorizontal: 10 }, resumeLabel: { fontSize: 11, fontWeight: "800" }, resumeTitle: { width: "100%", fontSize: 15, fontWeight: "900", textAlign: "right", marginTop: 2 }, resumeSub: { width: "100%", fontSize: 11, textAlign: "right", marginTop: 2 }, shortcuts: { flexDirection: "row-reverse", gap: 10, marginTop: 14 }, shortcut: { flex: 1, height: 78, borderRadius: 22, alignItems: "center", justifyContent: "center", gap: 6 }, shortcutText: { fontSize: 12, fontWeight: "800", textAlign: "center" }, section: { marginTop: 26 }, footer: { marginTop: 16 }, loading: { paddingVertical: 22 }, empty: { marginTop: 18, borderRadius: 22, padding: 20, alignItems: "center", gap: 8 }, emptyText: { fontSize: 12, lineHeight: 19, textAlign: "center" }, pressed: { opacity: .75, transform: [{ scale: .98 }] } });
