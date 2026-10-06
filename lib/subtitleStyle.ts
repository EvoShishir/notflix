/**
 * How subtitles look — size, position, colour, outline, shadow, background box.
 *
 * libVLC draws text subtitles with its own freetype renderer and ignores the
 * OS caption settings, so styling has to be handed to libVLC itself. Those
 * knobs are *instance* options (`--freetype-*`, `--sub-margin`), which the
 * player library only reads when it builds a fresh LibVLC for a new `source`.
 * Changing the style therefore means reloading the stream; the player screen
 * handles that and seeks back.
 *
 * One global preference, not per title: people pick a look once and expect it
 * everywhere.
 *
 * `.ass` / `.ssa` files carry their own styling and are rendered by libass, so
 * most of this has no effect on them. That is libVLC's behaviour, not a bug.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "notflix.subtitleStyle.v1";

export type SubtitleSize = "small" | "medium" | "large" | "xlarge";
export type SubtitleColor = "white" | "yellow";
export type SubtitleOutline = "none" | "thin" | "normal" | "thick";

export interface SubtitleStyle {
  size: SubtitleSize;
  /** Steps above the default baseline, 0…POSITION_MAX. */
  position: number;
  color: SubtitleColor;
  outline: SubtitleOutline;
  shadow: boolean;
  /** A translucent box behind the text. */
  background: boolean;
  bold: boolean;
}

/** libVLC's own defaults: medium white text, normal outline, soft shadow. */
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  size: "medium",
  position: 0,
  color: "white",
  outline: "normal",
  shadow: true,
  background: false,
  bold: false,
};

export const POSITION_MAX = 8;

/**
 * `freetype-rel-fontsize` is a *divisor*: the font is the video height over
 * this number, so smaller values mean bigger text. 16 is VLC's "Normal".
 */
const REL_FONT_SIZE: Record<SubtitleSize, number> = {
  small: 20,
  medium: 16,
  large: 13,
  xlarge: 10,
};

/** freetype colours are decimal RGB integers. */
const COLOR: Record<SubtitleColor, number> = {
  white: 0xffffff,
  yellow: 0xffff00,
};

/** VLC's own outline presets. */
const OUTLINE: Record<SubtitleOutline, number> = {
  none: 0,
  thin: 2,
  normal: 4,
  thick: 6,
};

/** Pixels per position step, measured in the rendered picture. */
const MARGIN_STEP = 25;

/** The LibVLC instance options that produce a given style. */
export function subtitleInitOptions(style: SubtitleStyle): string[] {
  const options = [
    `--freetype-rel-fontsize=${REL_FONT_SIZE[style.size]}`,
    `--freetype-color=${COLOR[style.color]}`,
    `--freetype-outline-thickness=${OUTLINE[style.outline]}`,
    `--freetype-shadow-opacity=${style.shadow ? 160 : 0}`,
    `--freetype-background-opacity=${style.background ? 160 : 0}`,
    `--sub-margin=${style.position * MARGIN_STEP}`,
  ];
  if (style.bold) options.push("--freetype-bold");
  return options;
}

export function sameSubtitleStyle(a: SubtitleStyle, b: SubtitleStyle) {
  return (Object.keys(a) as (keyof SubtitleStyle)[]).every(
    (key) => a[key] === b[key]
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Store                                   */
/* -------------------------------------------------------------------------- */

let style: SubtitleStyle = DEFAULT_SUBTITLE_STYLE;
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
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(style)).catch(() => {});
  }, 500);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function hydrateSubtitleStyle() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    // Spread over the defaults so a field added later still has a value.
    if (raw) style = { ...DEFAULT_SUBTITLE_STYLE, ...JSON.parse(raw) };
  } catch {
    style = DEFAULT_SUBTITLE_STYLE;
  }
  emit();
}

export function getSubtitleStyle(): SubtitleStyle {
  return style;
}

export function setSubtitleStyle(patch: Partial<SubtitleStyle>) {
  style = { ...style, ...patch };
  emit();
  scheduleFlush();
}

export function resetSubtitleStyle() {
  style = DEFAULT_SUBTITLE_STYLE;
  emit();
  scheduleFlush();
}

export function useSubtitleStyle(): SubtitleStyle {
  return useSyncExternalStore(subscribe, getSubtitleStyle, getSubtitleStyle);
}
