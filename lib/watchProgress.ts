/**
 * Watch progress, stored on the device.
 *
 * Deliberately not a React context: progress updates fire every few seconds
 * during playback, and a context would re-render every poster card on screen
 * each time. This is an external store instead — `useWatchProgress(id)` returns
 * the record for one title, and React skips the re-render when that particular
 * record's identity hasn't changed, so a tick for the video you're watching
 * doesn't touch the rest of the grid.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMemo, useSyncExternalStore } from "react";

const STORAGE_KEY = "notflix.watchProgress.v1";

/** Below this fraction, "resume" would just replay the intro — start over. */
const RESUME_FLOOR = 0.02;
/** Past this fraction the title counts as watched, not partially watched. */
const FINISHED_CEILING = 0.95;
/** Don't offer to resume within the last minute of a title. */
const RESUME_TAIL_SECONDS = 60;

export interface WatchRecord {
  /** Video or episode id. */
  id: string;
  /** Last playback position, in seconds. */
  position: number;
  /** Total runtime in seconds, as reported by the player. */
  duration: number;
  /** Epoch ms of the last update — drives "continue watching" ordering. */
  updatedAt: number;
  /** Parent post id for episodes; null for movies. */
  showId: string | null;

  /**
   * Enough of the title to render a card without another network round trip.
   *
   * Denormalised on purpose: the Continue Watching shelf has to work offline
   * and before the home feed has loaded, and looking these up would mean
   * refetching every partially-watched title on every launch. Optional, because
   * records written before this existed won't carry them.
   */
  title?: string;
  poster?: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

/** The extra title details `recordProgress` stores alongside the position. */
export interface WatchMeta {
  showId?: string | null;
  title?: string;
  poster?: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

type Records = Record<string, WatchRecord>;

let records: Records = {};
let hydrated = false;
const listeners = new Set<() => void>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

/**
 * Writes are debounced: playback updates progress every few seconds, and each
 * one would otherwise be a separate AsyncStorage round trip.
 */
function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(records)).catch(() => {});
  }, 1000);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Load persisted progress once, at app start. */
export async function hydrateWatchProgress() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) records = JSON.parse(raw) as Records;
  } catch {
    // A corrupt blob shouldn't stop the app booting; start from empty.
    records = {};
  }
  emit();
}

/**
 * Record a position. Called from the player on a timer and on unmount.
 *
 * Positions inside the opening moments are ignored so that merely opening a
 * title doesn't fill the library with 3-second "in progress" entries.
 */
export function recordProgress(
  id: string,
  position: number,
  duration: number,
  meta: WatchMeta = {}
) {
  if (!id || !Number.isFinite(position) || !Number.isFinite(duration)) return;
  if (duration <= 0) return;

  const fraction = position / duration;
  if (fraction < RESUME_FLOOR) {
    // Too early to be meaningful — and if something was stored before, drop it.
    if (records[id]) {
      const { [id]: _removed, ...rest } = records;
      records = rest;
      emit();
      scheduleFlush();
    }
    return;
  }

  records = {
    ...records,
    [id]: {
      // Keep details already stored: the player supplies them, but a caller
      // that only knows the position must not blank out the card.
      ...records[id],
      ...meta,
      showId: meta.showId ?? records[id]?.showId ?? null,
      id,
      position,
      duration,
      updatedAt: Date.now(),
    },
  };
  emit();
  scheduleFlush();
}

export function clearProgress(id: string) {
  if (!records[id]) return;
  const { [id]: _removed, ...rest } = records;
  records = rest;
  emit();
  scheduleFlush();
}

/** Drop every stored position — used when deleting a download, if asked. */
export function clearProgressForShow(showId: string) {
  const next: Records = {};
  let changed = false;
  for (const [key, record] of Object.entries(records)) {
    if (record.showId === showId) changed = true;
    else next[key] = record;
  }
  if (!changed) return;
  records = next;
  emit();
  scheduleFlush();
}

export function getProgress(id: string): WatchRecord | undefined {
  return records[id];
}

/** 0-1 watched fraction, or 0 when nothing is stored. */
export function getFraction(record: WatchRecord | undefined) {
  if (!record || record.duration <= 0) return 0;
  return Math.min(record.position / record.duration, 1);
}

export function isFinished(record: WatchRecord | undefined) {
  return getFraction(record) >= FINISHED_CEILING;
}

/**
 * Where playback should start, in seconds.
 *
 * Returns 0 for a finished title so replaying starts from the beginning rather
 * than the closing credits.
 */
export function getResumePosition(id: string) {
  const record = records[id];
  if (!record) return 0;
  if (isFinished(record)) return 0;
  if (record.duration - record.position < RESUME_TAIL_SECONDS) return 0;
  return record.position;
}

/** Titles with a position, most recently watched first. */
export function getContinueWatching(limit = 20): WatchRecord[] {
  return Object.values(records)
    // Records saved before the card details existed cannot be rendered.
    .filter((record) => !isFinished(record) && !!record.poster)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

/** Subscribe a component to one title's progress. */
export function useWatchProgress(id: string | undefined) {
  return useSyncExternalStore(
    subscribe,
    () => (id ? records[id] : undefined),
    () => undefined
  );
}

/** Subscribe to the whole map — for screens that list progress. */
export function useAllWatchProgress() {
  return useSyncExternalStore(
    subscribe,
    () => records,
    () => records
  );
}

/** Subscribed `getContinueWatching`, for the home shelf. */
export function useContinueWatching(limit = 20) {
  const all = useAllWatchProgress();
  return useMemo(() => getContinueWatching(limit), [all, limit]);
}
