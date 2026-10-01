/**
 * NotFlix design tokens.
 *
 * Source of truth: design-system/notflix/MASTER.md
 * Style: "Dark Mode (OLED)" — dark-only by design (light mode is not recommended
 * for this product type), so every surface below is authored against a true black
 * background for OLED power efficiency and cinematic contrast.
 *
 * Never hardcode a color, radius, duration or spacing value in a screen — add it
 * here and reference the token so both themes and future restyling stay cheap.
 */

import { Platform } from "react-native";
// Reanimated's Easing, NOT react-native's: `withTiming` calls the easing
// function on the UI thread every frame, and only Reanimated's version is a
// worklet. Passing RN's throws "tried to call a non-worklet function".
import { Easing } from "react-native-reanimated";

/* -------------------------------------------------------------------------- */
/*                                   Color                                    */
/* -------------------------------------------------------------------------- */

export const Palette = {
  /** True black — OLED pixels stay off, maximises perceived contrast. */
  background: "#000000",
  /** Raised surface (cards, sheets, inputs). */
  card: "#0C0C0D",
  /** Second-level surface (chips, skeletons, pressed cards). */
  muted: "#181818",
  /** Third-level surface, used for shimmer highlights. */
  elevated: "#232326",

  /** Primary text. ~20:1 on background. */
  foreground: "#F8FAFC",
  /** Secondary text. ~8.3:1 on background — well above the 4.5:1 body floor. */
  mutedForeground: "#94A3B8",
  /**
   * Tertiary text (placeholders, inactive dots). ~5.5:1 on background: dimmer
   * than `mutedForeground` but still a passing body-text contrast, because
   * placeholder copy is real text people have to read.
   */
  subtleForeground: "#7A8494",

  /** Brand action color ("play red"). */
  accent: "#E11D48",
  accentPressed: "#BE123C",
  accentSoft: "rgba(225, 29, 72, 0.16)",
  onAccent: "#FFFFFF",

  /** Cinema indigo, used for depth gradients behind hero content. */
  secondary: "#1E1B4B",

  /** Hairlines. Neutral so they stay visible against both card and background. */
  border: "rgba(248, 250, 252, 0.10)",
  borderStrong: "rgba(248, 250, 252, 0.18)",
  /** Accent-tinted border from the design system, for selected/active surfaces. */
  borderAccent: "#312E81",

  destructive: "#EF4444",
  onDestructive: "#000000",
  /** Focus / keyboard ring. */
  ring: "#FFFFFF",
  /** Rating star. ~13:1 on background. */
  star: "#FACC15",

  /** Overlays and scrims, measured against a photographic backdrop. */
  scrim: "rgba(0, 0, 0, 0.62)",
  glass: "rgba(12, 12, 13, 0.72)",
  pressOverlay: "rgba(248, 250, 252, 0.08)",
  ripple: "rgba(248, 250, 252, 0.12)",
} as const;

/** Multi-stop gradients. Tuples are `as const` so expo-linear-gradient keeps the length. */
export const Gradients = {
  /** Hero / backdrop scrim: transparent at the top, opaque where text sits. */
  heroScrim: [
    "rgba(0,0,0,0)",
    "rgba(0,0,0,0.35)",
    "rgba(0,0,0,0.82)",
    "#000000",
  ] as const,
  /** Shorter scrim for poster cards. */
  cardScrim: ["rgba(0,0,0,0)", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.92)"] as const,
  /** Top-of-screen fade so status bar text stays legible over artwork. */
  topScrim: ["rgba(0,0,0,0.75)", "rgba(0,0,0,0)"] as const,
  /** Brand fill for primary CTAs. */
  accent: ["#F43F5E", "#E11D48", "#BE123C"] as const,
  /** Indigo→black wash used behind category tiles. */
  cinema: ["#1E1B4B", "#0C0C0D"] as const,
  /** Skeleton shimmer sweep. */
  shimmer: [
    "rgba(248,250,252,0)",
    "rgba(248,250,252,0.07)",
    "rgba(248,250,252,0)",
  ] as const,
} as const;

/* -------------------------------------------------------------------------- */
/*                                  Spacing                                   */
/* -------------------------------------------------------------------------- */

/** 4/8dp rhythm. Density dial: 5/10 (standard). */
export const Spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

/** Horizontal page gutter — widens on tablets per the adaptive-gutter rule. */
export function gutterFor(width: number) {
  if (width >= 1024) return Spacing.xl;
  if (width >= 768) return Spacing.lg;
  return Spacing.md;
}

/* -------------------------------------------------------------------------- */
/*                                Typography                                  */
/* -------------------------------------------------------------------------- */

/** Font family names as registered with `useFonts` in app/_layout.tsx. */
export const FontFamily = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  extrabold: "Inter_800ExtraBold",
} as const;

export const FontSize = {
  caption: 11,
  micro: 12,
  small: 13,
  body: 15,
  bodyLg: 16,
  title: 18,
  headline: 22,
  display: 28,
  hero: 34,
} as const;

/** `lineHeight` values — 1.5x for body copy, tighter for display. */
export const LineHeight = {
  caption: 16,
  micro: 16,
  small: 18,
  body: 22,
  bodyLg: 24,
  title: 24,
  headline: 28,
  display: 34,
  hero: 40,
} as const;

/* -------------------------------------------------------------------------- */
/*                                  Motion                                    */
/* -------------------------------------------------------------------------- */

/**
 * Durations are chosen per distance/complexity rather than reused as one value:
 * micro press feedback is near-instant, screen-level choreography is longer.
 */
export const Duration = {
  /** Press / tap acknowledgement. */
  instant: 120,
  /** Chips, icons, small opacity swaps. */
  fast: 180,
  /** Default element entrance. */
  base: 280,
  /** Cards and list rows travelling a longer distance. */
  slow: 420,
  /** Hero / route-level choreography. */
  hero: 620,
} as const;

/** Per-item delay for staggered list reveals. */
export const Stagger = {
  tight: 40,
  base: 60,
  loose: 90,
  /** Cap the cascade so row 40 doesn't animate 4 seconds late. */
  max: 6,
} as const;

export const Easings = {
  /** Decelerate — for things entering the screen. */
  out: Easing.bezier(0.22, 1, 0.36, 1),
  /** Accelerate — for things leaving (exits run faster than entrances). */
  in: Easing.bezier(0.55, 0, 1, 0.45),
  /** Symmetric — for things moving within the screen. */
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  linear: Easing.linear,
} as const;

/** Reanimated spring configs. */
export const Springs = {
  /** Snappy, no overshoot — press states. */
  press: { damping: 20, stiffness: 260, mass: 0.8 },
  /** Gentle overshoot — appearing chips and badges. */
  bouncy: { damping: 12, stiffness: 180, mass: 0.9 },
  /** Settles smoothly — layout and scroll-linked values. */
  smooth: { damping: 24, stiffness: 140, mass: 1 },
} as const;

/** How far a card scales down while held. Never changes layout bounds. */
export const PressScale = 0.96;

/* -------------------------------------------------------------------------- */
/*                             Elevation & sizing                             */
/* -------------------------------------------------------------------------- */

export const Shadows = {
  card: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.45,
      shadowRadius: 12,
    },
    default: { elevation: 6 },
  }),
  raised: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.55,
      shadowRadius: 24,
    },
    default: { elevation: 12 },
  }),
  accentGlow: Platform.select({
    ios: {
      shadowColor: Palette.accent,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.45,
      shadowRadius: 18,
    },
    default: { elevation: 10 },
  }),
} as const;

/**
 * Minimum touch target. iOS uses 44pt, Android 48dp — these are different
 * platform guidelines, not one cross-platform number.
 */
export const HitSlop = { top: 12, bottom: 12, left: 12, right: 12 } as const;
export const TouchTarget = Platform.select({
  ios: 44,
  android: 48,
  default: 44,
}) as number;

export const IconSize = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 28,
} as const;

/** Poster aspect ratio (2:3) shared by every card so grids never reflow. */
export const POSTER_ASPECT = 2 / 3;

/**
 * Floating tab bar geometry.
 *
 * `TAB_BAR_HEIGHT` is the visible bar itself; the bottom safe-area inset and
 * `TAB_BAR_BOTTOM_PAD` are added on top so the labels sit clear of the gesture
 * bar rather than hard against it. Use `useTabBarClearance()` so the bar and
 * every screen's bottom content padding can never drift apart.
 */
export const TAB_BAR_HEIGHT = 62;
export const TAB_BAR_BOTTOM_PAD = Spacing.md;
