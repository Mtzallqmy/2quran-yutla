import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

export type ThemeMode = "light" | "dark";
export const palettes = {
  light: { background: "#F7F3EA", surface: "#FFFFFF", surfaceMuted: "#E7EFEA", text: "#17211F", textMuted: "#66736E", emerald: "#075E54", emeraldSoft: "#D6EEE7", gold: "#C99A3D", goldSoft: "#F7EACD", border: "#D9E4DE", danger: "#A94343" },
  dark: { background: "#101A18", surface: "#172421", surfaceMuted: "#21342F", text: "#F2F7F5", textMuted: "#B1C2BA", emerald: "#54C9AE", emeraldSoft: "#173F37", gold: "#E8BC62", goldSoft: "#42391F", border: "#2B423B", danger: "#F19A96" },
} as const;
type ThemeValue = { mode: ThemeMode; colors: (typeof palettes)[ThemeMode]; toggleTheme: () => void };
const Context = createContext<ThemeValue | undefined>(undefined);
const KEY = "quran-yutla:theme";

export function QuranThemeProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<ThemeMode>("dark");
  useEffect(() => { void AsyncStorage.getItem(KEY).then((saved) => { if (saved === "light" || saved === "dark") setMode(saved); }); }, []);
  const value = useMemo<ThemeValue>(() => ({
    mode, colors: palettes[mode],
    toggleTheme: () => setMode((current) => { const next = current === "dark" ? "light" : "dark"; void AsyncStorage.setItem(KEY, next); return next; }),
  }), [mode]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useQuranTheme() {
  const context = useContext(Context);
  if (!context) throw new Error("useQuranTheme must be used within QuranThemeProvider");
  return context;
}
