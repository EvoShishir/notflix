/**
 * Motion helpers.
 *
 * Every animated entrance in the app goes through here so that "Reduce Motion"
 * (iOS Settings > Accessibility, Android Settings > Accessibility) is honoured in
 * one place: when it is on, elements render in their final state instead of
 * animating, and auto-advancing content stops moving entirely.
 */

import { Duration, Easings, Stagger } from "@/constants/theme";
import { useMemo } from "react";
import {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  ReduceMotion,
  useReducedMotion,
  ZoomIn,
} from "react-native-reanimated";

/** Cap the cascade so a long list's last row does not animate seconds late. */
function staggerDelay(index: number, step: number = Stagger.base) {
  return Math.min(index, Stagger.max) * step;
}

/**
 * Entrance animations for lists and sections.
 *
 * `enabled` is normally `useMotionEnabled()`. When it is false every factory
 * returns `undefined`, which tells Reanimated to mount without animating.
 */
export function entrances(enabled: boolean) {
  return {
    /** Simple opacity fade — safest default for large images. */
    fade: (delay: number = 0) =>
      enabled
        ? FadeIn.duration(Duration.base)
            .delay(delay)
            .easing(Easings.out)
            .reduceMotion(ReduceMotion.System)
        : undefined,

    /** Rises into place. Use for content that arrives from below the fold. */
    rise: (index: number = 0, step: number = Stagger.base) =>
      enabled
        ? FadeInDown.duration(Duration.slow)
            .delay(staggerDelay(index, step))
            .easing(Easings.out)
            .reduceMotion(ReduceMotion.System)
        : undefined,

    /** Drops in from above. Use for headers and toolbars. */
    drop: (delay: number = 0) =>
      enabled
        ? FadeInUp.duration(Duration.base)
            .delay(delay)
            .easing(Easings.out)
            .reduceMotion(ReduceMotion.System)
        : undefined,

    /** Scales up from 92%. Use for chips, badges and CTAs. */
    pop: (delay: number = 0) =>
      enabled
        ? ZoomIn.duration(Duration.base)
            .delay(delay)
            .easing(Easings.out)
            .reduceMotion(ReduceMotion.System)
        : undefined,

    /** Exits run faster than entrances so the UI never feels sluggish. */
    exit: () =>
      enabled
        ? FadeOut.duration(Duration.fast)
            .easing(Easings.in)
            .reduceMotion(ReduceMotion.System)
        : undefined,
  };
}

/**
 * `true` when decorative motion should play.
 *
 * Note this is inverted from the hook name it wraps — read it as
 * "is motion enabled", not "is motion reduced".
 */
export function useMotionEnabled() {
  return !useReducedMotion();
}

/**
 * Both values at once, for components that need the raw flag as well.
 *
 * Memoised because `entrances()` builds five closures: called unmemoised from a
 * list cell, that is five allocations per item per render, which shows up as
 * GC churn while scrolling.
 */
export function useMotion() {
  const enabled = useMotionEnabled();
  return useMemo(() => ({ enabled, enter: entrances(enabled) }), [enabled]);
}
