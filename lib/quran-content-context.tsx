import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import { fetchQuranCatalog, type QuranCatalog } from "@/lib/quran-catalog";

type ContentState = { catalog: QuranCatalog | null; loading: boolean; error: string | null; refresh: () => Promise<void> };
const Context = createContext<ContentState | undefined>(undefined);
const CACHE_KEY = "quran-yutla:catalog-v4";

function isApprovedCatalog(value: unknown): value is QuranCatalog {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<QuranCatalog>;
  return candidate.source === "Cloudflare R2/D1" && Array.isArray(candidate.surahs) && Array.isArray(candidate.reciters) && Array.isArray(candidate.radios) && candidate.reciters.every((reciter) => typeof reciter === "object" && reciter !== null && Array.isArray((reciter as { moshafs?: unknown }).moshafs));
}

export function QuranContentProvider({ children }: PropsWithChildren) {
  const [catalog, setCatalog] = useState<QuranCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const latest = await fetchQuranCatalog();
      setCatalog(latest);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(latest));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحديث المحتوى المعتمد الآن.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void AsyncStorage.getItem(CACHE_KEY)
      .then((saved) => {
        if (!saved) return;
        try {
          const parsed: unknown = JSON.parse(saved);
          if (isApprovedCatalog(parsed)) setCatalog(parsed);
        } catch {
          // تُهمل النسخة المحلية غير السليمة أو السابقة لفهرس الحقوق المركزي.
        }
      })
      .finally(() => { void refresh(); });
  }, [refresh]);

  const value = useMemo(() => ({ catalog, loading, error, refresh }), [catalog, error, loading, refresh]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useQuranContent() {
  const context = useContext(Context);
  if (!context) throw new Error("useQuranContent must be used within QuranContentProvider");
  return context;
}
