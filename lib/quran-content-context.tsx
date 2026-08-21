import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";

import { fetchQuranCatalog, type QuranCatalog } from "@/lib/quran-catalog";
import { fetchContentManifest } from "@/lib/r2-media-client";

type ContentState = { catalog: QuranCatalog | null; loading: boolean; error: string | null; refresh: () => Promise<void> };
type CachedCatalog = { catalog: QuranCatalog; manifestEtag: string | null };
const Context = createContext<ContentState | undefined>(undefined);
const CACHE_KEY = "quran-yutla:catalog-v6";

function isApprovedCatalog(value: unknown): value is QuranCatalog {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<QuranCatalog>;
  return candidate.source === "Cloudflare R2/D1" && Array.isArray(candidate.surahs) && Array.isArray(candidate.reciters) && Array.isArray(candidate.radios) && Array.isArray(candidate.stations) && candidate.reciters.every((reciter) => typeof reciter === "object" && reciter !== null && Array.isArray((reciter as { moshafs?: unknown }).moshafs));
}

function isCachedCatalog(value: unknown): value is CachedCatalog {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CachedCatalog>;
  return isApprovedCatalog(candidate.catalog) && (typeof candidate.manifestEtag === "string" || candidate.manifestEtag === null);
}

export function QuranContentProvider({ children }: PropsWithChildren) {
  const [catalog, setCatalog] = useState<QuranCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const manifestEtagRef = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const manifest = await fetchContentManifest(manifestEtagRef.current);
      if (manifest.notModified) return;
      const latest = await fetchQuranCatalog();
      manifestEtagRef.current = manifest.etag;
      setCatalog(latest);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ catalog: latest, manifestEtag: manifest.etag } satisfies CachedCatalog));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحديث المحتوى المعتمد الآن.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void AsyncStorage.getItem(CACHE_KEY).then((saved) => {
      if (saved) try {
        const parsed: unknown = JSON.parse(saved);
        if (isCachedCatalog(parsed)) { manifestEtagRef.current = parsed.manifestEtag; setCatalog(parsed.catalog); return; }
        if (isApprovedCatalog(parsed)) setCatalog(parsed);
      } catch { /* تُهمل النسخة المحلية غير السليمة. */ }
    }).finally(() => { void refresh(); });
  }, [refresh]);

  const value = useMemo(() => ({ catalog, loading, error, refresh }), [catalog, error, loading, refresh]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useQuranContent() {
  const context = useContext(Context);
  if (!context) throw new Error("useQuranContent must be used within QuranContentProvider");
  return context;
}
