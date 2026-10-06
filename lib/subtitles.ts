/**
 * Subtitle files and per-title sync offsets.
 *
 * libVLC loads sidecar subtitle files natively and can shift their timing
 * itself, so nothing here parses cues — a file picked from the device is copied
 * into app storage and handed to the player by path, and the offset is applied
 * with `setSubtitleDelay`. All this module owns is where the file lives and what
 * offset the user settled on for a given title.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "notflix.subtitlePrefs.v1";
const SUBTITLE_DIR = `${FileSystem.documentDirectory}subtitles/`;

/** Subtitle containers libVLC can read. */
export const SUBTITLE_EXTENSIONS = [
  ".srt",
  ".vtt",
  ".ass",
  ".ssa",
  ".sub",
  ".idx",
  ".smi",
] as const;

export function isSubtitleFile(name: string) {
  const lower = name.toLowerCase();
  return SUBTITLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Copy a picked subtitle into app storage and return a path the player can open.
 *
 * The copy is deliberate. The picker hands back a cache URI (or a `content://`
 * document on Android), neither of which is guaranteed to survive — the cache
 * can be evicted and a content URI's permission grant ends with the session.
 * Keeping our own copy in the document directory means reopening a title months
 * later still finds its subtitles, and the original extension is preserved
 * because libVLC picks its parser from it.
 */
export async function importSubtitleFile(
  videoId: string,
  sourceUri: string,
  originalName: string
): Promise<string> {
  const info = await FileSystem.getInfoAsync(SUBTITLE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(SUBTITLE_DIR, { intermediates: true });
  }

  const match = /\.([a-z0-9]{2,4})$/i.exec(originalName);
  const extension = match ? `.${match[1].toLowerCase()}` : ".srt";

  const safe = videoId.replace(/[^a-z0-9._-]/gi, "_");
  const destination = `${SUBTITLE_DIR}${safe}-${Date.now()}${extension}`;

  await FileSystem.copyAsync({ from: sourceUri, to: destination });
  return destination;
}

/** True when a previously imported subtitle is still on disk. */
export async function subtitleFileExists(uri: string) {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
}

/** Remove every cached subtitle file for a title. */
export async function clearSubtitleFiles(videoId: string) {
  try {
    const entries = await FileSystem.readDirectoryAsync(SUBTITLE_DIR);
    const prefix = videoId.replace(/[^a-z0-9._-]/gi, "_");
    await Promise.all(
      entries
        .filter((name) => name.startsWith(prefix))
        .map((name) =>
          FileSystem.deleteAsync(`${SUBTITLE_DIR}${name}`, { idempotent: true })
        )
    );
  } catch {
    // Nothing cached yet; nothing to clean up.
  }
}

export interface Cue {
  /** Seconds from the start of the video. */
  start: number;
  end: number;
  text: string;
}

/* -------------------------------------------------------------------------- */
/*                              Per-title settings                            */
/* -------------------------------------------------------------------------- */

/**
 * A remembered track choice.
 *
 * libVLC's ids come from the demuxer, so they are stable for the same file, but
 * the name is kept too: a re-encoded or replaced file can number its streams
 * differently, and "English 5.1" is a better match than a bare index.
 */
export interface TrackRef {
  id: number;
  name: string;
}

/** Find a remembered track in a fresh list: exact match, then name, then id. */
export function matchTrack<T extends TrackRef>(
  list: T[],
  ref: TrackRef
): T | undefined {
  return (
    list.find((t) => t.id === ref.id && t.name === ref.name) ??
    (ref.name ? list.find((t) => t.name === ref.name) : undefined) ??
    list.find((t) => t.id === ref.id)
  );
}

export interface SubtitlePref {
  /** Seconds to shift the subtitles by. Positive = show later. */
  offset: number;
  /** Path to the imported file, so reopening a title restores its subtitles. */
  fileUri?: string;
  /** The file's original name, shown in the settings panel. */
  label?: string;
  /** Audio track chosen for this title. */
  audioTrack?: TrackRef;
  /** Embedded subtitle track chosen for this title; id -1 means off. */
  subtitleTrack?: TrackRef;
}

type Prefs = Record<string, SubtitlePref>;

let prefs: Prefs = {};
let hydrated = false;
const listeners = new Set<() => void>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)).catch(() => {});
  }, 500);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function hydrateSubtitlePrefs() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) prefs = JSON.parse(raw) as Prefs;
  } catch {
    prefs = {};
  }
  emit();
}

export function getSubtitlePref(videoId: string): SubtitlePref {
  return prefs[videoId] ?? { offset: 0 };
}

export function setSubtitlePref(videoId: string, patch: Partial<SubtitlePref>) {
  prefs = {
    ...prefs,
    [videoId]: { ...(prefs[videoId] ?? { offset: 0 }), ...patch },
  };
  emit();
  scheduleFlush();
}

export function useSubtitlePref(videoId: string | undefined): SubtitlePref {
  return useSyncExternalStore(
    subscribe,
    () => (videoId ? (prefs[videoId] ?? EMPTY_PREF) : EMPTY_PREF),
    () => EMPTY_PREF
  );
}

/** Stable identity, so a component with no stored pref never re-renders. */
const EMPTY_PREF: SubtitlePref = { offset: 0 };

/** Offsets step in quarter seconds — fine enough to fix drift, coarse enough to aim. */
export const OFFSET_STEP = 0.25;
export const OFFSET_LIMIT = 30;

export function formatOffset(offset: number) {
  if (Math.abs(offset) < 0.001) return "In sync";
  const sign = offset > 0 ? "+" : "−";
  return `${sign}${Math.abs(offset).toFixed(2).replace(/\.?0+$/, "")}s`;
}
