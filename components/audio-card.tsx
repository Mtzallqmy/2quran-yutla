import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArtworkOrb } from "@/components/artwork-orb";
import { usePlayer } from "@/lib/player-context";
import type { AudioItem } from "@/lib/quran-data";
import { useQuranTheme } from "@/lib/quran-theme";

export function AudioCard({ item, compact = false }: { item: AudioItem; compact?: boolean }) {
  const router = useRouter(); const { colors } = useQuranTheme(); const { current, isPlaying, favorites, playItem, togglePlayback, toggleFavorite } = usePlayer();
  const currentItem = current?.id === item.id; const favorite = favorites.includes(item.id);
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: currentItem ? colors.emerald : colors.border }]}>
    <Pressable onPress={() => void (currentItem ? togglePlayback() : playItem(item))} style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
      <ArtworkOrb color={item.color} kind={item.kind} size={compact ? 46 : 54} /><View style={styles.copy}><Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{item.title}</Text><Text numberOfLines={1} style={[styles.subtitle, { color: colors.textMuted }]}>{item.subtitle}</Text>{item.durationLabel ? <Text style={[styles.meta, { color: colors.gold }]}>{item.durationLabel}</Text> : null}</View>
      <View style={[styles.play, { backgroundColor: currentItem && isPlaying ? colors.emerald : colors.emeraldSoft }]}><MaterialCommunityIcons name={currentItem && isPlaying ? "pause" : "play"} size={22} color={currentItem && isPlaying ? "#FFFFFF" : colors.emerald} /></View>
    </Pressable>
    <Pressable onPress={() => toggleFavorite(item.id)} hitSlop={8} style={({ pressed }) => [styles.heart, pressed && styles.pressed]}><MaterialCommunityIcons name={favorite ? "heart" : "heart-outline"} size={20} color={favorite ? colors.gold : colors.textMuted} /></Pressable>
    <Pressable onPress={() => router.push(`/item/${item.id}` as never)} hitSlop={8} style={({ pressed }) => [styles.detail, pressed && styles.pressed]}><MaterialCommunityIcons name="chevron-left" size={21} color={colors.textMuted} /></Pressable>
  </View>;
}
const styles = StyleSheet.create({ card: { minHeight: 76, borderRadius: 22, borderWidth: 1, marginBottom: 10, padding: 10, flexDirection: "row", alignItems: "center" }, main: { flex: 1, flexDirection: "row", alignItems: "center" }, copy: { flex: 1, marginHorizontal: 12, alignItems: "flex-end" }, title: { width: "100%", textAlign: "right", fontSize: 15, fontWeight: "800", lineHeight: 22 }, subtitle: { width: "100%", textAlign: "right", fontSize: 12, marginTop: 2, lineHeight: 18 }, meta: { width: "100%", textAlign: "right", fontSize: 11, marginTop: 3, fontWeight: "700" }, play: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" }, heart: { width: 30, alignItems: "center", justifyContent: "center", marginLeft: 4 }, detail: { width: 22, alignItems: "center", justifyContent: "center" }, pressed: { opacity: .72, transform: [{ scale: .98 }] } });
