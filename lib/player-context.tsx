import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer, setAudioModeAsync, type AudioStatus } from "expo-audio";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";

import { haptic } from "@/lib/haptics";
import type { AudioItem } from "@/lib/quran-data";

type Playlist = { id: string; title: string; itemIds: string[]; createdAt: string };
type ResumePoint = { positionSeconds: number; updatedAt: string };
type Stored = { favorites?: string[]; playlists?: Playlist[]; recentIds?: string[]; resumePositions?: Record<string, ResumePoint>; volume?: number };
type PlaybackMode = "asset" | "station" | "hls";
type PlayerValue = {
  current: AudioItem | null; isPlaying: boolean; error: string | null; stationId: string | null; playbackMode: PlaybackMode;
  currentTime: number; duration: number; volume: number; resumePositions: Record<string, ResumePoint>;
  favorites: string[]; playlists: Playlist[]; recentIds: string[];
  playItem: (item: AudioItem, startAtSeconds?: number, stationId?: string) => Promise<void>; playLiveStream: (item: AudioItem) => Promise<void>;
  togglePlayback: () => void; stopPlayback: () => void; reconnect: () => Promise<void>; seekTo: (seconds: number) => Promise<void>; skipBy: (seconds: number) => Promise<void>; setVolume: (value: number) => void;
  toggleFavorite: (id: string) => void; createPlaylist: (title: string) => void; addToPlaylist: (playlistId: string, itemId: string) => void;
};

const Context = createContext<PlayerValue | undefined>(undefined);
const KEY = "quran-yutla:player-v3";
const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum);

function canResume(item: AudioItem | null, mode: PlaybackMode) {
  return Boolean(item && mode === "asset" && item.streamType !== "hls" && item.kind === "reciter");
}

export function PlayerProvider({ children }: PropsWithChildren) {
  const audio = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const statusSubscription = useRef<{ remove: () => void } | null>(null);
  const requestId = useRef(0);
  const currentRef = useRef<AudioItem | null>(null); const modeRef = useRef<PlaybackMode>("asset"); const positionRef = useRef(0); const durationRef = useRef(0);
  const favoritesRef = useRef<string[]>([]); const playlistsRef = useRef<Playlist[]>([]); const recentIdsRef = useRef<string[]>([]); const resumeRef = useRef<Record<string, ResumePoint>>({}); const volumeRef = useRef(0.9); const lastSavedPositionRef = useRef<Record<string, number>>({});
  const [current, setCurrent] = useState<AudioItem | null>(null); const [isPlaying, setIsPlaying] = useState(false); const [error, setError] = useState<string | null>(null); const [stationId, setStationId] = useState<string | null>(null); const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("asset");
  const [currentTime, setCurrentTime] = useState(0); const [duration, setDuration] = useState(0); const [volume, setVolumeState] = useState(0.9); const [resumePositions, setResumePositions] = useState<Record<string, ResumePoint>>({});
  const [favorites, setFavorites] = useState<string[]>([]); const [playlists, setPlaylists] = useState<Playlist[]>([]); const [recentIds, setRecentIds] = useState<string[]>([]);

  const persist = useCallback(() => void AsyncStorage.setItem(KEY, JSON.stringify({ favorites: favoritesRef.current, playlists: playlistsRef.current, recentIds: recentIdsRef.current, resumePositions: resumeRef.current, volume: volumeRef.current } satisfies Stored)), []);
  const rememberPosition = useCallback((force = false) => {
    const item = currentRef.current; const seconds = positionRef.current; const total = durationRef.current;
    if (!canResume(item, modeRef.current) || !item || seconds < 3) return;
    if (!force && Math.abs((lastSavedPositionRef.current[item.id] ?? 0) - seconds) < 8) return;
    lastSavedPositionRef.current[item.id] = seconds;
    const nearEnd = total > 0 && seconds >= total - 3;
    const next = { ...resumeRef.current };
    if (nearEnd) delete next[item.id]; else next[item.id] = { positionSeconds: Math.floor(seconds), updatedAt: new Date().toISOString() };
    resumeRef.current = next; setResumePositions(next); persist();
  }, [persist]);
  const removeStatusListener = useCallback(() => { statusSubscription.current?.remove(); statusSubscription.current = null; }, []);
  const releaseCurrent = useCallback((savePosition = true) => {
    if (savePosition) rememberPosition(true);
    removeStatusListener();
    if (audio.current) { audio.current.pause(); audio.current.remove(); audio.current = null; }
    setIsPlaying(false); positionRef.current = 0; durationRef.current = 0; setCurrentTime(0); setDuration(0);
  }, [rememberPosition, removeStatusListener]);

  const handleStatus = useCallback((status: AudioStatus) => {
    const seconds = Math.max(0, Number(status.currentTime) || 0); const total = Math.max(0, Number(status.duration) || 0);
    positionRef.current = seconds; durationRef.current = total; setCurrentTime(seconds); setDuration(total); setIsPlaying(Boolean(status.playing));
    if (status.didJustFinish && currentRef.current) { positionRef.current = 0; setCurrentTime(0); rememberPosition(true); }
    else rememberPosition(false);
  }, [rememberPosition]);

  useEffect(() => {
    void AsyncStorage.getItem(KEY).then((saved) => {
      if (!saved) return;
      try {
        const data = JSON.parse(saved) as Stored;
        const loadedFavorites = data.favorites ?? []; const loadedPlaylists = data.playlists ?? []; const loadedRecent = data.recentIds ?? []; const loadedResume = data.resumePositions ?? {}; const loadedVolume = clamp(Number(data.volume ?? 0.9), 0, 1);
        favoritesRef.current = loadedFavorites; playlistsRef.current = loadedPlaylists; recentIdsRef.current = loadedRecent; resumeRef.current = loadedResume; volumeRef.current = loadedVolume;
        setFavorites(loadedFavorites); setPlaylists(loadedPlaylists); setRecentIds(loadedRecent); setResumePositions(loadedResume); setVolumeState(loadedVolume);
      } catch { /* تجاهل النسخة المحلية غير السليمة. */ }
    });
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true });
    return () => releaseCurrent(true);
  }, [releaseCurrent]);

  const startPlayback = useCallback(async (item: AudioItem, startAtSeconds: number | undefined, radioStationId?: string, mode: PlaybackMode = "asset") => {
    const token = ++requestId.current; setError(null); setStationId(radioStationId ?? null); modeRef.current = mode; setPlaybackMode(mode); releaseCurrent(true);
    try {
      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true });
      if (token !== requestId.current) return;
      const next = createAudioPlayer(item.streamUrl, { updateInterval: 350, crossOrigin: "anonymous" });
      if (token !== requestId.current) { next.remove(); return; }
      const remembered = canResume(item, mode) ? resumeRef.current[item.id]?.positionSeconds ?? 0 : 0;
      const initialPosition = Number.isFinite(startAtSeconds) && (startAtSeconds ?? 0) > 0 ? startAtSeconds! : remembered;
      next.volume = volumeRef.current; audio.current = next; currentRef.current = item; setCurrent(item);
      statusSubscription.current = next.addListener("playbackStatusUpdate", handleStatus);
      if (initialPosition > 0) await next.seekTo(initialPosition);
      next.play(); setIsPlaying(true);
      const nextIds = [item.id, ...recentIdsRef.current.filter((id) => id !== item.id)].slice(0, 12); recentIdsRef.current = nextIds; setRecentIds(nextIds); persist(); haptic.light();
    } catch {
      if (token === requestId.current) { setIsPlaying(false); setError("تعذر بدء المصدر الحالي. تحقّق من الاتصال ثم أعد المحاولة."); }
    }
  }, [handleStatus, persist, releaseCurrent]);

  const playItem = useCallback((item: AudioItem, startAtSeconds?: number, radioStationId?: string) => startPlayback(item, startAtSeconds, radioStationId, radioStationId ? "station" : "asset"), [startPlayback]);
  const playLiveStream = useCallback((item: AudioItem) => startPlayback({ ...item, streamType: "hls", downloadUrl: null, expectedBytes: undefined, sha256: undefined }, 0, undefined, "hls"), [startPlayback]);
  const stopPlayback = useCallback(() => { ++requestId.current; releaseCurrent(true); currentRef.current = null; setCurrent(null); setStationId(null); modeRef.current = "asset"; setPlaybackMode("asset"); haptic.light(); }, [releaseCurrent]);
  const togglePlayback = useCallback(() => { if (!audio.current || !currentRef.current) return; if (isPlaying) { audio.current.pause(); rememberPosition(true); setIsPlaying(false); } else { audio.current.play(); setIsPlaying(true); } haptic.light(); }, [isPlaying, rememberPosition]);
  const seekTo = useCallback(async (seconds: number) => { if (!audio.current || !currentRef.current || !canResume(currentRef.current, modeRef.current)) return; const target = clamp(seconds, 0, durationRef.current || Math.max(seconds, 0)); await audio.current.seekTo(target); positionRef.current = target; setCurrentTime(target); rememberPosition(true); }, [rememberPosition]);
  const skipBy = useCallback(async (seconds: number) => seekTo(positionRef.current + seconds), [seekTo]);
  const setVolume = useCallback((value: number) => { const next = clamp(value, 0, 1); volumeRef.current = next; setVolumeState(next); if (audio.current) audio.current.volume = next; persist(); }, [persist]);
  const reconnect = useCallback(async () => { if (currentRef.current) await startPlayback(currentRef.current, canResume(currentRef.current, modeRef.current) ? positionRef.current : 0, stationId ?? undefined, modeRef.current); }, [startPlayback, stationId]);
  const toggleFavorite = useCallback((id: string) => { const next = favoritesRef.current.includes(id) ? favoritesRef.current.filter((item) => item !== id) : [...favoritesRef.current, id]; favoritesRef.current = next; setFavorites(next); persist(); haptic.light(); }, [persist]);
  const createPlaylist = useCallback((title: string) => { const clean = title.trim(); if (!clean) return; const next = [{ id: `playlist-${Date.now()}`, title: clean, itemIds: [], createdAt: new Date().toISOString() }, ...playlistsRef.current]; playlistsRef.current = next; setPlaylists(next); persist(); haptic.success(); }, [persist]);
  const addToPlaylist = useCallback((playlistId: string, itemId: string) => { const next = playlistsRef.current.map((playlist) => playlist.id === playlistId && !playlist.itemIds.includes(itemId) ? { ...playlist, itemIds: [...playlist.itemIds, itemId] } : playlist); playlistsRef.current = next; setPlaylists(next); persist(); }, [persist]);
  const value = useMemo<PlayerValue>(() => ({ current, isPlaying, error, stationId, playbackMode, currentTime, duration, volume, resumePositions, favorites, playlists, recentIds, playItem, playLiveStream, togglePlayback, stopPlayback, reconnect, seekTo, skipBy, setVolume, toggleFavorite, createPlaylist, addToPlaylist }), [addToPlaylist, createPlaylist, current, currentTime, duration, error, favorites, isPlaying, playbackMode, playlists, playItem, playLiveStream, recentIds, reconnect, resumePositions, seekTo, setVolume, skipBy, stationId, stopPlayback, toggleFavorite, togglePlayback, volume]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePlayer() { const context = useContext(Context); if (!context) throw new Error("usePlayer must be used within PlayerProvider"); return context; }
