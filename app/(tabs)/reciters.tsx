import { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { AudioCard } from "@/components/audio-card";
import { ScreenContainer } from "@/components/screen-container";
import { reciters } from "@/lib/quran-data";
import { useQuranTheme } from "@/lib/quran-theme";

export default function RecitersScreen() { const { colors } = useQuranTheme(); const [query, setQuery] = useState(""); const items = useMemo(() => reciters.filter((item) => item.title.includes(query.trim())), [query]); return <ScreenContainer style={{ backgroundColor: colors.background }}><FlatList data={items} keyExtractor={(item) => item.id} renderItem={({ item }) => <AudioCard item={item} />} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} ListHeaderComponent={<View><Text style={[styles.title, { color: colors.text }]}>القراء</Text><Text style={[styles.subtitle, { color: colors.textMuted }]}>تلاوات مختارة من أصوات مباركة</Text><TextInput value={query} onChangeText={setQuery} placeholder="ابحث باسم القارئ" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]} textAlign="right" returnKeyType="done" /></View>} /></ScreenContainer>; }
const styles = StyleSheet.create({ content: { padding: 18, paddingBottom: 176 }, title: { textAlign: "right", fontWeight: "900", fontSize: 28, lineHeight: 36 }, subtitle: { textAlign: "right", marginTop: 4, fontSize: 13, lineHeight: 20 }, input: { marginTop: 18, minHeight: 52, borderRadius: 18, borderWidth: 1, paddingHorizontal: 15, fontSize: 14, writingDirection: "rtl", marginBottom: 14 } });
