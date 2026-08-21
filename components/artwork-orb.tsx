import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { StyleSheet, View } from "react-native";
import type { AudioKind } from "@/lib/quran-data";

const iconFor: Record<AudioKind, keyof typeof MaterialCommunityIcons.glyphMap> = { station: "radio", reciter: "account-voice", story: "book-open-page-variant" };
export function ArtworkOrb({ color, kind, size = 52 }: { color: string; kind: AudioKind; size?: number }) {
  return <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}><View style={[styles.ring, { width: size * .68, height: size * .68, borderRadius: size / 2 }]} /><MaterialCommunityIcons name={iconFor[kind]} size={size * .42} color="#FFFFFF" /></View>;
}
const styles = StyleSheet.create({ wrap: { alignItems: "center", justifyContent: "center", overflow: "hidden" }, ring: { position: "absolute", borderWidth: 1, borderColor: "rgba(255,255,255,.42)" } });
