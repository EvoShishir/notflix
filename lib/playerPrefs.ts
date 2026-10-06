/**
 * Player preferences carried from one viewing to the next: brightness, volume
 * and which audio output libVLC uses.
 *
 * Global rather than per title, the way a phone's own levels are: someone who
 * dims the screen to watch in bed wants it dim for the next episode too.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

// Kept from when this held only brightness and volume, so saved levels survive.
const STORAGE_KEY = "notflix.playerLevels.v1";

/**
 * libVLC's Android audio outputs.
 *
 * AudioTrack is libVLC's default. On some phones it reports unreliable timing
 * for the first moments after playback starts or resumes, and libVLC drops
 * audio until it settles — a couple of silent seconds. OpenSL ES is the
 * alternative VLC's own app offers for exactly that.
 */
export type AudioOutput = "audiotrack" | "opensles";

export interface PlayerPrefs {
  /** Screen brightness, 0–1; null until the user has set one in the player. */
  brightness: number | null;
  /** Player volume, 0–200 (100 is unity). */
  volume: number;
  audioOutput: AudioOutput;
}

const DEFAULT_PREFS: PlayerPrefs = {
  brightness: null,
  volume: 100,
  audioOutput: "audiotrack",
};

let prefs: PlayerPrefs = DEFAULT_PREFS;
let hydrated = false;
const listeners = new Set<() => void>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function scheduleFlush() {
  // Swipes write many times a second; only the level they settle on matters.
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

export async function hydratePlayerPrefs() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) prefs = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    prefs = DEFAULT_PREFS;
  }
  emit();
}

export function getPlayerPrefs(): PlayerPrefs {
  return prefs;
}

export function setPlayerPrefs(patch: Partial<PlayerPrefs>) {
  prefs = { ...prefs, ...patch };
  emit();
  scheduleFlush();
}

/** The audio output, for UI and for rebuilding the player when it changes. */
export function useAudioOutput(): AudioOutput {
  return useSyncExternalStore(
    subscribe,
    () => prefs.audioOutput,
    () => prefs.audioOutput
  );
}

/** LibVLC instance options for an audio output; empty keeps libVLC's default. */
export function audioOutputInitOptions(output: AudioOutput): string[] {
  return output === "opensles" ? ["--aout=opensles"] : [];
}
