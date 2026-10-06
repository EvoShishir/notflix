/**
 * The player's brightness and volume, carried from one viewing to the next.
 *
 * Global rather than per title, the way a phone's own levels are: someone who
 * dims the screen to watch in bed wants it dim for the next episode too.
 *
 * Read once when the player opens and written as the levels change, so unlike
 * the other stores there is no hook — nothing renders from these values.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "notflix.playerLevels.v1";

export interface PlayerLevels {
  /** Screen brightness, 0–1; null until the user has set one in the player. */
  brightness: number | null;
  /** Player volume, 0–200 (100 is unity). */
  volume: number;
}

const DEFAULT_LEVELS: PlayerLevels = { brightness: null, volume: 100 };

let levels: PlayerLevels = DEFAULT_LEVELS;
let hydrated = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
  // Swipes write many times a second; only the level they settle on matters.
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(levels)).catch(() => {});
  }, 500);
}

export async function hydratePlayerLevels() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) levels = { ...DEFAULT_LEVELS, ...JSON.parse(raw) };
  } catch {
    levels = DEFAULT_LEVELS;
  }
}

export function getPlayerLevels(): PlayerLevels {
  return levels;
}

export function setPlayerLevels(patch: Partial<PlayerLevels>) {
  levels = { ...levels, ...patch };
  scheduleFlush();
}
