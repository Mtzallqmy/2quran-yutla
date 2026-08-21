import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuranTheme } from "@/lib/quran-theme";

const items = [{ name: "index", title: "الرئيسية", icon: "home-variant" }, { name: "listen", title: "استمع", icon: "radio" }, { name: "reciters", title: "القراء", icon: "account-voice" }, { name: "library", title: "مكتبتي", icon: "library-shelves" }, { name: "settings", title: "إعدادات", icon: "cog-outline" }] as const;
export default function TabLayout() { const { colors } = useQuranTheme(); const insets = useSafeAreaInsets(); const bottom = Platform.OS === "web" ? 8 : Math.max(insets.bottom, 8); return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.emerald, tabBarInactiveTintColor: colors.textMuted, tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 58 + bottom, paddingTop: 7, paddingBottom: bottom }, tabBarLabelStyle: { fontSize: 10, fontWeight: "800" } }}>{items.map((item) => <Tabs.Screen key={item.name} name={item.name} options={{ title: item.title, tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name={item.icon} color={color} size={size} /> }} />)}</Tabs>; }
