import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { getApiBaseUrl } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import * as Auth from "@/lib/_core/auth";
import { useQuranTheme } from "@/lib/quran-theme";
import { trpc } from "@/lib/trpc";

function Field({ value, placeholder, onChange, colors, numeric }: { value: string; placeholder: string; onChange: (value: string) => void; colors: ReturnType<typeof useQuranTheme>["colors"]; numeric?: boolean }) {
  return <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.textMuted} keyboardType={numeric ? "number-pad" : "default"} autoCapitalize="none" textAlign="right" style={[styles.input, { color: colors.text, borderColor: colors.border }]} />;
}

export default function ReciterAdminScreen() {
  const { colors } = useQuranTheme(); const router = useRouter(); const { isAuthenticated, loading } = useAuth();
  const [id, setId] = useState(""); const [nameAr, setNameAr] = useState(""); const [nameEn, setNameEn] = useState(""); const [description, setDescription] = useState(""); const [sortOrder, setSortOrder] = useState("100"); const [imageSourceUrl, setImageSourceUrl] = useState(""); const [attribution, setAttribution] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("أنشئ بيانات القارئ أولًا، ثم ارفع صورة مرخصة أو تملك حق استخدامها.");
  const upsert = trpc.mediaAdmin.upsertReciter.useMutation({ onSuccess: () => setMessage("تم حفظ بيانات القارئ وحالة نشره."), onError: (error) => setMessage(error.message) });
  const saveReciter = () => upsert.mutate({ id, nameAr, nameEn: nameEn || undefined, description: description || undefined, sortOrder: Number(sortOrder || 0), publicationStatus: "published", isActive: true });
  const uploadImage = async () => {
    if (!id || !imageSourceUrl.startsWith("https://")) { setMessage("أدخل معرّف القارئ ورابط HTTPS لمصدر الصورة قبل الرفع."); return; }
    const selected = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png", "image/webp"], copyToCacheDirectory: true });
    if (selected.canceled) return;
    const file = selected.assets[0]; const contentType = file.mimeType as "image/jpeg" | "image/png" | "image/webp" | undefined;
    if (!contentType || !["image/jpeg", "image/png", "image/webp"].includes(contentType)) { setMessage("اختر صورة JPEG أو PNG أو WebP فقط."); return; }
    if (file.size && file.size > 5 * 1024 * 1024) { setMessage("الحد الأقصى لصورة القارئ 5 MB."); return; }
    setBusy(true); setMessage("يجري رفع الصورة وحفظ البصمة وإصدار التخزين…");
    try {
      const token = await Auth.getSessionToken(); const url = `${getApiBaseUrl()}/api/admin/reciters/${encodeURIComponent(id)}/image`; const headers = { authorization: token ? `Bearer ${token}` : "", "content-type": contentType, "x-original-url": imageSourceUrl, ...(attribution ? { "x-attribution-snapshot": attribution } : {}) };
      if (Platform.OS === "web" && file.file) {
        const response = await fetch(url, { method: "PUT", headers, body: file.file }); const body = await response.text(); if (!response.ok) throw new Error(JSON.parse(body).error || "تعذر رفع الصورة.");
      } else {
        const response = await FileSystem.uploadAsync(url, file.uri, { httpMethod: "PUT", uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers }); if (response.status < 200 || response.status >= 300) throw new Error(JSON.parse(response.body).error || "تعذر رفع الصورة.");
      }
      setMessage("تم تفعيل صورة القارئ بنسخة جديدة في R2. سيظهر الرابط تلقائيًا في الفهرس المنشور.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر رفع الصورة."); } finally { setBusy(false); }
  };
  if (loading) return <ScreenContainer style={styles.center}><ActivityIndicator color={colors.emerald} /></ScreenContainer>;
  if (!isAuthenticated) return <ScreenContainer style={styles.gated}><Text style={[styles.title, { color: colors.text }]}>إدارة القراء</Text><Text style={[styles.copy, { color: colors.textMuted }]}>تحتاج هذه اللوحة إلى تسجيل دخول المالك.</Text><Pressable onPress={() => router.push("/(tabs)/settings" as never)} style={[styles.primary, { backgroundColor: colors.emerald }]}><Text style={styles.primaryText}>العودة للإعدادات</Text></Pressable></ScreenContainer>;
  return <ScreenContainer style={{ backgroundColor: colors.background }}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><View style={styles.head}><Pressable onPress={() => router.back()} style={styles.back}><MaterialCommunityIcons name="arrow-right" size={23} color={colors.emerald} /></Pressable><View><Text style={[styles.title, { color: colors.text }]}>إدارة القراء والصور</Text><Text style={[styles.copy, { color: colors.textMuted }]}>البيانات والصورة والإصدار محفوظة في الفهرس المركزي، لا في تطبيق الهاتف.</Text></View></View><View style={[styles.notice, { backgroundColor: colors.emeraldSoft }]}><MaterialCommunityIcons name="image-check-outline" size={22} color={colors.emerald} /><Text style={[styles.noticeText, { color: colors.textMuted }]}>لا ترفع صورة من الإنترنت لمجرد توفرها. أدخل رابط المصدر والإسناد المطلوب قبل الرفع؛ تنشأ نسخة R2 جديدة عند كل استبدال.</Text></View><View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.section, { color: colors.gold }]}>بيانات القارئ</Text><Field value={id} placeholder="معرّف القارئ بالإنجليزية" onChange={setId} colors={colors} /><Field value={nameAr} placeholder="اسم القارئ بالعربية" onChange={setNameAr} colors={colors} /><Field value={nameEn} placeholder="الاسم بالإنجليزية (اختياري)" onChange={setNameEn} colors={colors} /><Field value={description} placeholder="نبذة أو وصف (اختياري)" onChange={setDescription} colors={colors} /><Field value={sortOrder} placeholder="ترتيب الظهور" onChange={setSortOrder} colors={colors} numeric /><Pressable disabled={upsert.isPending || !id || !nameAr} onPress={saveReciter} style={[styles.primary, { backgroundColor: colors.emerald }]}><Text style={styles.primaryText}>{upsert.isPending ? "جارٍ الحفظ" : "حفظ ونشر القارئ"}</Text></Pressable></View><View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 15 }]}><Text style={[styles.section, { color: colors.gold }]}>صورة موثقة</Text><Field value={imageSourceUrl} placeholder="رابط HTTPS لمصدر الصورة أو ترخيصها" onChange={setImageSourceUrl} colors={colors} /><Field value={attribution} placeholder="نص الإسناد المطلوب (إن وُجد)" onChange={setAttribution} colors={colors} /><Pressable disabled={busy} onPress={() => void uploadImage()} style={[styles.upload, { borderColor: colors.gold }]}>{busy ? <ActivityIndicator color={colors.gold} /> : <MaterialCommunityIcons name="image-plus" size={21} color={colors.gold} />}<Text style={[styles.uploadText, { color: colors.gold }]}>{busy ? "جارٍ الرفع والتحقق" : "اختيار ورفع الصورة"}</Text></Pressable></View><Text style={[styles.message, { color: colors.textMuted }]}>{message}</Text></ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({ content: { padding: 20, paddingBottom: 120 }, center: { alignItems: "center", justifyContent: "center" }, gated: { padding: 24, justifyContent: "center" }, head: { flexDirection: "row-reverse", gap: 12, alignItems: "center" }, back: { width: 42, height: 42, alignItems: "center", justifyContent: "center" }, title: { textAlign: "right", fontSize: 24, fontWeight: "900" }, copy: { textAlign: "right", fontSize: 12, marginTop: 3, lineHeight: 19 }, notice: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 10, borderRadius: 20, padding: 14, marginTop: 20 }, noticeText: { flex: 1, textAlign: "right", fontSize: 12, lineHeight: 19 }, card: { borderWidth: 1, borderRadius: 22, padding: 15, marginTop: 20 }, section: { textAlign: "right", marginBottom: 4, fontSize: 13, fontWeight: "900" }, input: { minHeight: 45, borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, marginTop: 8, writingDirection: "rtl", fontSize: 12 }, primary: { minHeight: 46, borderRadius: 14, justifyContent: "center", alignItems: "center", marginTop: 14 }, primaryText: { color: "#FFF", fontWeight: "900", fontSize: 13 }, upload: { minHeight: 46, borderWidth: 1, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row-reverse", gap: 7, marginTop: 12 }, uploadText: { fontWeight: "900", fontSize: 13 }, message: { textAlign: "right", fontSize: 12, lineHeight: 20, marginTop: 18 } });
