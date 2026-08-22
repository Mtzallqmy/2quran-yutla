import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { MiniPlayer } from "@/components/mini-player";
import { PlayerProvider } from "@/lib/player-context";
import { QuranContentProvider } from "@/lib/quran-content-context";
import { QuranThemeProvider, useQuranTheme } from "@/lib/quran-theme";
import { TrpcProvider } from "@/lib/trpc-provider";

function Navigator() { const { colors, mode } = useQuranTheme(); return <View style={{ flex: 1, backgroundColor: colors.background }}><StatusBar style={mode === "dark" ? "light" : "dark"} /><Stack screenOptions={{ headerShown: false, animation: "fade" }}><Stack.Screen name="(tabs)" /><Stack.Screen name="player" options={{ presentation: "card" }} /><Stack.Screen name="owner-login" options={{ presentation: "card" }} /><Stack.Screen name="admin/media" options={{ presentation: "card" }} /></Stack><MiniPlayer /></View>; }
export default function RootLayout() { return <TrpcProvider><QuranThemeProvider><QuranContentProvider><PlayerProvider><Navigator /></PlayerProvider></QuranContentProvider></QuranThemeProvider></TrpcProvider>; }
