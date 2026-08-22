import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useOwnerEmailSession } from "@/hooks/use-owner-email-session";
import { useQuranTheme } from "@/lib/quran-theme";

export default function OwnerLoginScreen() {
  const { colors } = useQuranTheme();
  const router = useRouter();
  const { authenticated, loading, login } = useOwnerEmailSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const submit = async () => {
    setMessage(null);
    try {
      await login.mutateAsync({ email: email.trim(), password });
      setPassword("");
      router.replace("/(tabs)/settings" as never);
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تسجيل الدخول."); }
  };

  if (loading) return <ScreenContainer style={styles.center}><ActivityIndicator color={colors.emerald} /></ScreenContainer>;
  if (authenticated) return <ScreenContainer style={styles.center}><MaterialCommunityIcons name="shield-check" color={colors.emerald} size={46} /><Text style={[styles.title, { color: colors.text }]}>جلسة المالك مفعّلة</Text><Pressable onPress={() => router.replace("/(tabs)/settings" as never)} style={[styles.primary, { backgroundColor: colors.emerald }]}><Text style={styles.primaryText}>العودة للإعدادات</Text></Pressable></ScreenContainer>;

  return <ScreenContainer style={{ backgroundColor: colors.background }}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.grow}><View style={styles.content}><Pressable onPress={() => router.back()} style={styles.back}><MaterialCommunityIcons name="arrow-right" size={24} color={colors.emerald} /></Pressable><View style={[styles.icon, { backgroundColor: colors.emeraldSoft }]}><MaterialCommunityIcons name="shield-account-outline" size={42} color={colors.emerald} /></View><Text style={[styles.title, { color: colors.text }]}>دخول المالك</Text><Text style={[styles.copy, { color: colors.textMuted }]}>استخدم البريد الإلكتروني المهيأ للمالك وكلمة المرور الإدارية. لا تُحفظ كلمة المرور على الجهاز.</Text><View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><TextInput value={email} onChangeText={setEmail} placeholder="البريد الإلكتروني" placeholderTextColor={colors.textMuted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" autoComplete="email" returnKeyType="next" style={[styles.input, { color: colors.text, borderColor: colors.border }]} textAlign="right" /><TextInput value={password} onChangeText={setPassword} placeholder="كلمة المرور" placeholderTextColor={colors.textMuted} secureTextEntry textContentType="password" autoComplete="password" returnKeyType="done" onSubmitEditing={() => void submit()} style={[styles.input, { color: colors.text, borderColor: colors.border }]} textAlign="right" /><Pressable disabled={login.isPending || !email.trim() || password.length < 8} onPress={() => void submit()} style={[styles.primary, { backgroundColor: colors.emerald }, (login.isPending || !email.trim() || password.length < 8) && styles.disabled]}>{login.isPending ? <ActivityIndicator color="#FFF" /> : <><MaterialCommunityIcons name="login" size={19} color="#FFF" /><Text style={styles.primaryText}>تسجيل الدخول</Text></>}</Pressable>{message ? <Text style={[styles.error, { color: colors.danger }]}>{message}</Text> : null}</View><Text style={[styles.footnote, { color: colors.textMuted }]}>لأمان الحساب، تُوقف المحاولات الخاطئة مؤقتًا بعد عدد محدود من المحاولات.</Text></View></KeyboardAvoidingView></ScreenContainer>;
}

const styles = StyleSheet.create({ grow: { flex: 1 }, center: { alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }, content: { flex: 1, padding: 24, justifyContent: "center" }, back: { position: "absolute", top: 8, right: 18, width: 44, height: 44, justifyContent: "center", alignItems: "center" }, icon: { width: 86, height: 86, borderRadius: 29, justifyContent: "center", alignItems: "center", alignSelf: "center" }, title: { textAlign: "center", fontWeight: "900", fontSize: 27, marginTop: 22 }, copy: { textAlign: "center", fontSize: 13, lineHeight: 21, marginTop: 8, paddingHorizontal: 14 }, card: { borderWidth: 1, borderRadius: 24, padding: 16, marginTop: 26 }, input: { minHeight: 52, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, marginTop: 10, writingDirection: "rtl", fontSize: 14 }, primary: { minHeight: 49, borderRadius: 15, justifyContent: "center", alignItems: "center", flexDirection: "row-reverse", gap: 8, marginTop: 16 }, primaryText: { color: "#FFF", fontSize: 13, fontWeight: "900" }, disabled: { opacity: 0.5 }, error: { textAlign: "right", lineHeight: 19, fontSize: 12, marginTop: 12 }, footnote: { textAlign: "center", lineHeight: 18, fontSize: 10, marginTop: 16, paddingHorizontal: 22 } });
