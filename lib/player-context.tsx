import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";

import { haptic } from "@/lib/haptics";
import type { AudioItem } from "@/lib/quran-data";

type Playlist = { id: string; title: string; itemIds: string[]; createdAt: string };
type Stored = { favorites: string[]; playlists: Playlist[]; recentIds: string[] };
type PlayerValue = {
  current: AudioItem | null; isPlaying: boolean; error: string | null; favorites: string[]; playlists: Playlist[]; recentIds: string[];
  playItem: (item: AudioItem) => Promise<void>; togglePlayback: () => void; toggleFavorite: (id: string) => void; createPlaylist: (title: string) => void; addToPlaylist: (playlistId: string, itemId: string) => void;
};
const Context = createContext<PlayerValue | undefined>(undefined);
const KEY = "quran-yutla:player-v1";

export function PlayerProvider({ children }: PropsWithChildren) {
  const audio = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const [current, setCurrent] = useState<AudioItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const persist = useCallback((data: Stored) => void AsyncStorage.setItem(KEY, JSON.stringify(data)), []);

  useEffect(() => {
    void AsyncStorage.getItem(KEY).then((saved) => { if (!saved) return; try { const data = JSON.parse(saved) as Stored; setFavorites(data.favorites ?? []); setPlaylists(data.playlists ?? []); setRecentIds(data.recentIds ?? []); } catch {} });
    void setAudioModeAsync({ playsInSilentMode: true });
    return () => { audio.current?.remove(); };
  }, []);

  const playItem = useCallback(async (item: AudioItem) => {
    try {
      setError(null); await setAudioModeAsync({ playsInSilentMode: true });
      if (current?.id === item.id && audio.current) audio.current.play();
      else { audio.current?.remove(); audio.current = createAudioPlayer(item.streamUrl); audio.current.play(); setCurrent(item); }
      setIsPlaying(true);
      setRecentIds((previous) => { const next = [item.id, ...previous.filter((id) => id !== item.id)].slice(0, 8); persist({ favorites, playlists, recentIds: next }); return next; });
      haptic.light();
    } catch { setIsPlaying(false); setError("تعذر بدء التشغيل الآن. تحقق من اتصالك أو جرّب مصدرًا آخر."); }
  }, [current?.id, favorites, persist, playlists]);
  const togglePlayback = useCallback(() => { if (!audio.current || !current) return; if (isPlaying) audio.current.pause(); else audio.current.play(); setIsPlaying((value) => !value); haptic.light(); }, [current, isPlaying]);
  const toggleFavorite = useCallback((id: string) => setFavorites((previous) => { const next = previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]; persist({ favorites: next, playlists, recentIds }); haptic.light(); return next; }), [persist, playlists, recentIds]);
  const createPlaylist = useCallback((title: string) => { const cleaned = title.trim(); if (!cleaned) return; setPlaylists((previous) => { const next = [{ id: `playlist-${Date.now()}`, title: cleaned, itemIds: [], createdAt: new Date().toISOString() }, ...previous]; persist({ favorites, playlists: next, recentIds }); haptic.success(); return next; }); }, [favorites, persist, recentIds]);
  const addToPlaylist = useCallback((playlistId: string, itemId: string) => setPlaylists((previous) => { const next = previous.map((playlist) => playlist.id === playlistId && !playlist.itemIds.includes(itemId) ? { ...playlist, itemIds: [...playlist.itemIds, itemId] } : playlist); persist({ favorites, playlists: next, recentIds }); return next; }), [favorites, persist, recentIds]);
  const value = useMemo<PlayerValue>(() => ({ current, isPlaying, error, favorites, playlists, recentIds, playItem, togglePlayback, toggleFavorite, createPlaylist, addToPlaylist }), [addToPlaylist, createPlaylist, current, error, favorites, isPlaying, playlists, playItem, recentIds, toggleFavorite, togglePlayback]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePlayer() { const context = useContext(Context); if (!context) throw new Error("usePlayer must be used within PlayerProvider"); return context; }
