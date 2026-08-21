import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { haptic } from "@/lib/haptics";
import type { AudioItem } from "@/lib/quran-data";

type Playlist = { id: string; title: string; itemIds: string[]; createdAt: string };
type Stored = { favorites: string[]; playlists: Playlist[]; recentIds: string[] };
type PlayerValue = { current: AudioItem | null; isPlaying: boolean; error: string | null; stationId: string | null; favorites: string[]; playlists: Playlist[]; recentIds: string[]; playItem: (item: AudioItem, startAtSeconds?: number, stationId?: string) => Promise<void>; togglePlayback: () => void; stopPlayback: () => void; reconnect: () => Promise<void>; toggleFavorite: (id: string) => void; createPlaylist: (title: string) => void; addToPlaylist: (playlistId: string, itemId: string) => void; };
const Context = createContext<PlayerValue | undefined>(undefined);
const KEY = "quran-yutla:player-v2";

export function PlayerProvider({ children }: PropsWithChildren) {
  const audio = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const requestId = useRef(0);
  const [current, setCurrent] = useState<AudioItem | null>(null); const [isPlaying, setIsPlaying] = useState(false); const [error, setError] = useState<string | null>(null); const [stationId, setStationId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]); const [playlists, setPlaylists] = useState<Playlist[]>([]); const [recentIds, setRecentIds] = useState<string[]>([]);
  const persist = useCallback((data: Stored) => void AsyncStorage.setItem(KEY, JSON.stringify(data)), []);
  const releaseCurrent = useCallback(() => { if (audio.current) { audio.current.pause(); audio.current.remove(); audio.current = null; } setIsPlaying(false); }, []);
  useEffect(() => { void AsyncStorage.getItem(KEY).then((saved) => { if (!saved) return; try { const data = JSON.parse(saved) as Stored; setFavorites(data.favorites ?? []); setPlaylists(data.playlists ?? []); setRecentIds(data.recentIds ?? []); } catch {} }); void setAudioModeAsync({ playsInSilentMode: true }); return () => releaseCurrent(); }, [releaseCurrent]);
  const playItem = useCallback(async (item: AudioItem, startAtSeconds = 0, radioStationId?: string) => {
    const token = ++requestId.current; setError(null); setStationId(radioStationId ?? null); releaseCurrent();
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
      if (token !== requestId.current) return;
      const next = createAudioPlayer(item.streamUrl);
      if (token !== requestId.current) { next.remove(); return; }
      audio.current = next;
      if (Number.isFinite(startAtSeconds) && startAtSeconds > 0) next.seekTo(startAtSeconds);
      next.play(); setCurrent(item); setIsPlaying(true);
      setRecentIds((previous) => { const nextIds = [item.id, ...previous.filter((id) => id !== item.id)].slice(0, 12); persist({ favorites, playlists, recentIds: nextIds }); return nextIds; }); haptic.light();
    } catch { if (token === requestId.current) { setIsPlaying(false); setError("تعذر بدء المصدر الحالي. تحقّق من الاتصال ثم أعد المحاولة."); } }
  }, [favorites, persist, playlists, releaseCurrent]);
  const stopPlayback = useCallback(() => { ++requestId.current; releaseCurrent(); setCurrent(null); setStationId(null); haptic.light(); }, [releaseCurrent]);
  const togglePlayback = useCallback(() => { if (!audio.current || !current) return; if (isPlaying) { audio.current.pause(); setIsPlaying(false); } else { audio.current.play(); setIsPlaying(true); } haptic.light(); }, [current, isPlaying]);
  const reconnect = useCallback(async () => { if (current) await playItem(current, 0, stationId ?? undefined); }, [current, playItem, stationId]);
  const toggleFavorite = useCallback((id: string) => setFavorites((previous) => { const next = previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]; persist({ favorites: next, playlists, recentIds }); haptic.light(); return next; }), [persist, playlists, recentIds]);
  const createPlaylist = useCallback((title: string) => { const clean = title.trim(); if (!clean) return; setPlaylists((previous) => { const next = [{ id: `playlist-${Date.now()}`, title: clean, itemIds: [], createdAt: new Date().toISOString() }, ...previous]; persist({ favorites, playlists: next, recentIds }); haptic.success(); return next; }); }, [favorites, persist, recentIds]);
  const addToPlaylist = useCallback((playlistId: string, itemId: string) => setPlaylists((previous) => { const next = previous.map((playlist) => playlist.id === playlistId && !playlist.itemIds.includes(itemId) ? { ...playlist, itemIds: [...playlist.itemIds, itemId] } : playlist); persist({ favorites, playlists: next, recentIds }); return next; }), [favorites, persist, recentIds]);
  const value = useMemo<PlayerValue>(() => ({ current, isPlaying, error, stationId, favorites, playlists, recentIds, playItem, togglePlayback, stopPlayback, reconnect, toggleFavorite, createPlaylist, addToPlaylist }), [addToPlaylist, createPlaylist, current, error, favorites, isPlaying, playlists, playItem, recentIds, reconnect, stationId, stopPlayback, toggleFavorite, togglePlayback]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePlayer() { const context = useContext(Context); if (!context) throw new Error("usePlayer must be used within PlayerProvider"); return context; }
