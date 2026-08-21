import { StyleSheet, Text, View } from "react-native";
import { useQuranTheme } from "@/lib/quran-theme";
export function SectionHeading({ title, eyebrow }: { title: string; eyebrow?: string }) { const { colors } = useQuranTheme(); return <View style={styles.wrap}>{eyebrow ? <Text style={[styles.eyebrow, { color: colors.gold }]}>{eyebrow}</Text> : null}<Text style={[styles.title, { color: colors.text }]}>{title}</Text></View>; }
const styles = StyleSheet.create({ wrap: { alignItems: "flex-end", marginBottom: 10 }, title: { fontSize: 19, fontWeight: "900", textAlign: "right", lineHeight: 28 }, eyebrow: { fontSize: 11, fontWeight: "800", textAlign: "right", marginBottom: 2, letterSpacing: .3 } });
