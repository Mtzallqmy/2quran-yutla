import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";

import { AudioCard } from "@/components/audio-card";
import { ScreenContainer } from "@/components/screen-container";
import { getRadioAudioItem } from "@/lib/quran-catalog";
import { fetchRadioStationNow, toAudioItem, type RadioStationNow } from "@/lib/r2-media-client";
import { usePlayer } from "@/lib/player-context";
import { useQuranContent } from "@/lib/quran-content-context";
import { useQuranTheme } from "@/lib/quran-theme";

function clock(value?: string) {
  return value ? new Intl.DateTimeFormat("ar", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
}

export default function ListenScreen() {
  const { colors } = useQuranTheme();
  const { catalog, loading, error, refresh } = useQuranContent();
  const { playItem, current, isPlaying, stationId: activeStationId } = usePlayer();
  const [query, setQuery] = useState("");
  const [broadcast, setBroadcast] = useState<RadioStationNow | null>(null);
  const [radioError, setRadioError] = useState<string | null>(null);
  const station = catalog?.stations[0];

  const loadBroadcast = useCallback(async () => {
    if (!station) { setBroadcast(null); return; }
    try { setRadioError(null); setBroadcast(await fetchRadioStationNow(station.id)); }
    catch (reason) { setRadioError(reason instanceof Error ? reason.message : "تعذر قراءة حالة المحطة."); }
  }, [station]);

  useEffect(() => {
    void loadBroadcast();
    const timer = setInterval(() => void loadBroadcast(), 15_000);
    return () => clearInterval(timer);
  }, [loadBroadcast]);

  useEffect(() => {
    const endsAt = broadcast?.now.endsAt;
    if (!endsAt) return;
    const waitMs = Math.max(900, Math.min(new Date(endsAt).getTime() - Date.now() + 350, 60_000));
    const timer = setTimeout(() => void loadBroadcast(), waitMs);
    return () => clearTimeout(timer);
  }, [broadcast?.now.endsAt, loadBroadcast]);

  useEffect(() => {
    if (!station || !broadcast || activeStationId !== station.id || !isPlaying || current?.id === broadcast.now.asset.id) return;
    void playItem(toAudioItem(broadcast.now.asset), Math.max(0, broadcast.now.startOffsetMs / 1000), station.id);
  }, [activeStationId, broadcast, current?.id, isPlaying, playItem, station]);

  const programs = useMemo(() => (catalog?.radios ?? []).filter((program) => program.name.includes(query.trim())).map(getRadioAudioItem), [catalog?.radios, query]);
  const startStation = async () => { if (station && broadcast) await playItem(toAudioItem(broadcast.now.asset), Math.max(0, broadcast.now.startOffsetMs / 1000), station.id); };
  const playingStation = Boolean(station && broadcast && activeStationId === station.id && current?.id === broadcast.now.asset.id && isPlaying);

  return <ScreenContainer style={{ backgroundColor: colors.background }}><FlatList data={programs} keyExtractor={(item) => item.id} renderItem={({ item }) => <AudioCard item={item} />} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void refresh(); void loadBroadcast(); }} tintColor={colors.emerald} />} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} ListHeaderComponent={<View><Text style={[styles.title, { color: colors.text }]}>المكتبة والإذاعة</Text><Text style={[styles.subtitle, { color: colors.textMuted }]}>محتوى مرخّص من الفهرس المركزي، مع محطة خاصة تدور تلقائيًا وفق قائمة بث موثقة.</Text>{station ? <View style={[styles.station, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.stationHead}><View style={[styles.livePill, { backgroundColor: colors.emeraldSoft }]}><View style={[styles.liveDot, { backgroundColor: colors.emerald }]} /><Text style={[styles.liveLabel, { color: colors.emerald }]}>يُبث الآن</Text></View><Text style={[styles.stationName, { color: colors.text }]}>{station.title}</Text></View>{broadcast ? <><Text style={[styles.nowTitle, { color: colors.text }]}>{broadcast.now.asset.title}</Text><Text style={[styles.nowMeta, { color: colors.textMuted }]}>بدأت {clock(broadcast.now.startsAt)} · تنتهي {clock(broadcast.now.endsAt)}</Text><View style={styles.nextLine}><MaterialCommunityIcons name="skip-next-circle-outline" size={17} color={colors.gold} /><Text style={[styles.nextText, { color: colors.textMuted }]}>التالي: {broadcast.next.asset.title}</Text></View><Pressable onPress={() => void startStation()} style={({ pressed }) => [styles.stationPlay, { backgroundColor: colors.emerald, opacity: pressed ? 0.86 : 1 }]}><MaterialCommunityIcons name={playingStation ? "volume-high" : "play"} size={19} color="#FFF" /><Text style={styles.stationPlayText}>{playingStation ? "تستمع إلى البث الجاري" : "استمع إلى الإذاعة الآن"}</Text></Pressable></> : <View style={styles.loadingStation}>{radioError ? <Text style={[styles.nowMeta, { color: colors.danger }]}>{radioError}</Text> : <ActivityIndicator color={colors.emerald} />}</View>}</View> : <View style={[styles.station, { backgroundColor: colors.surfaceMuted }]}><Text style={[styles.nowMeta, { color: colors.textMuted }]}>لا توجد محطة منشورة بعد. تظهر المحطة تلقائيًا عند نشر قائمة تشغيل مرخصة.</Text></View>}<View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialCommunityIcons name="magnify" color={colors.textMuted} size={21} /><TextInput value={query} onChangeText={setQuery} placeholder="ابحث باسم البرنامج" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text }]} textAlign="right" returnKeyType="done" /></View>{catalog ? <View style={[styles.liveNotice, { backgroundColor: colors.emeraldSoft }]}><MaterialCommunityIcons name="shield-check-outline" size={16} color={colors.emerald} /><Text style={[styles.liveText, { color: colors.emerald }]}>{catalog.radios.length} ملفًا إذاعيًا معتمدًا في الفهرس</Text></View> : null}</View>} ListEmptyComponent={<View style={[styles.empty, { backgroundColor: colors.surfaceMuted }]}>{loading ? <ActivityIndicator color={colors.emerald} /> : <><MaterialCommunityIcons name="radio-off" size={30} color={colors.gold} /><Text style={[styles.emptyText, { color: colors.textMuted }]}>{error ?? "لا توجد برامج إذاعية معتمدة في المكتبة حتى الآن."}</Text><Pressable onPress={() => { void refresh(); void loadBroadcast(); }} style={[styles.retry, { backgroundColor: colors.emerald }]}><Text style={styles.retryText}>تحديث الفهرس</Text></Pressable></>}</View>} /></ScreenContainer>;
}

const styles = StyleSheet.create({ content: { padding: 18, paddingBottom: 176 }, title: { textAlign: "right", fontWeight: "900", fontSize: 28, lineHeight: 36 }, subtitle: { textAlign: "right", marginTop: 4, fontSize: 13, lineHeight: 20 }, station: { marginTop: 18, borderWidth: 1, borderRadius: 22, padding: 16 }, stationHead: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, stationName: { fontSize: 17, fontWeight: "900" }, livePill: { flexDirection: "row-reverse", gap: 6, alignItems: "center", borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 }, liveDot: { width: 7, height: 7, borderRadius: 4 }, liveLabel: { fontSize: 10, fontWeight: "900" }, nowTitle: { textAlign: "right", fontWeight: "900", fontSize: 16, marginTop: 17 }, nowMeta: { textAlign: "right", fontSize: 11, marginTop: 5 }, nextLine: { flexDirection: "row-reverse", alignItems: "center", gap: 5, marginTop: 13 }, nextText: { fontSize: 11, flex: 1, textAlign: "right" }, stationPlay: { minHeight: 45, borderRadius: 14, marginTop: 16, alignItems: "center", justifyContent: "center", flexDirection: "row-reverse", gap: 8 }, stationPlayText: { color: "#FFF", fontWeight: "900", fontSize: 13 }, loadingStation: { minHeight: 60, justifyContent: "center" }, search: { marginTop: 18, minHeight: 52, paddingHorizontal: 15, borderWidth: 1, borderRadius: 18, flexDirection: "row-reverse", alignItems: "center" }, input: { flex: 1, marginRight: 9, fontSize: 14, writingDirection: "rtl" }, liveNotice: { marginTop: 13, height: 37, borderRadius: 13, paddingHorizontal: 12, flexDirection: "row-reverse", alignItems: "center", gap: 7 }, liveText: { fontSize: 11, fontWeight: "800" }, empty: { marginTop: 24, padding: 24, borderRadius: 22, alignItems: "center", gap: 10 }, emptyText: { textAlign: "center", fontSize: 12, lineHeight: 19 }, retry: { height: 38, borderRadius: 13, paddingHorizontal: 14, justifyContent: "center" }, retryText: { color: "#FFF", fontWeight: "800", fontSize: 12 } });
