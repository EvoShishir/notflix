/**
 * Screen chrome: a large in-flow title plus a sticky bar that materialises as you
 * scroll past it.
 *
 * The sticky bar sits above the status bar inset and only becomes opaque once the
 * large title has scrolled away, so artwork stays unobstructed at rest but text
 * never sits directly on a bright photo. Both pieces respect the top safe area.
 */

import { Gradients, Palette, Spacing, TouchTarget } from "@/constants/theme";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import {
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "./AppText";
import { IconButton } from "./Buttons";
import { useMotion } from "./Motion";

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

/** Scroll distance over which the sticky bar fades from clear to solid. */
const FADE_START = 40;
const FADE_END = 130;

interface StickyHeaderBarProps {
  title: string;
  /** Vertical scroll offset of the screen's list. */
  scrollY: SharedValue<number>;
  /** Show a back affordance. Defaults to true. */
  onBack?: () => void;
  showBack?: boolean;
  /** Optional trailing control, e.g. a search or filter button. */
  right?: React.ReactNode;
}

export function StickyHeaderBar({
  title,
  scrollY,
  onBack,
  showBack = true,
  right,
}: StickyHeaderBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /** Surface fades in as the large title leaves. */
  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [FADE_START, FADE_END],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  /** The compact title rises into place slightly after the surface. */
  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [FADE_END - 40, FADE_END],
      [0, 1],
      Extrapolation.CLAMP
    ),
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [FADE_END - 40, FADE_END],
          [10, 0],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  return (
    <View
      style={[styles.stickyBar, { paddingTop: insets.top, height: insets.top + TouchTarget + Spacing.xs }]}
      pointerEvents="box-none"
    >
      {/* Solid/blurred surface that fades in. */}
      <Animated.View style={[StyleSheet.absoluteFill, surfaceStyle]} pointerEvents="none">
        {Platform.OS === "ios" ? (
          <AnimatedBlurView
            intensity={60}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.androidSurface]} />
        )}
        <View style={styles.hairline} />
      </Animated.View>

      {/* Always-on gradient so back button and status text stay legible on artwork. */}
      <LinearGradient
        colors={Gradients.topScrim}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.stickyRow}>
        {showBack ? (
          <IconButton
            name="chevron-back"
            label="Go back"
            onPress={onBack ?? (() => router.back())}
          />
        ) : (
          <View style={{ width: TouchTarget }} />
        )}

        <Animated.View style={[styles.stickyTitle, titleStyle]} pointerEvents="none">
          <AppText variant="title" numberOfLines={1}>
            {title}
          </AppText>
        </Animated.View>

        {right ?? <View style={{ width: TouchTarget }} />}
      </View>
    </View>
  );
}

/**
 * Large in-flow page title. Render this as the first item of the scroll content —
 * it is what the sticky bar takes over from.
 */
export function LargeTitle({
  title,
  subtitle,
  eyebrow,
  style,
  /** Extra top padding, normally the sticky bar height. */
  offset = 0,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  style?: StyleProp<ViewStyle>;
  offset?: number;
}) {
  const { enter } = useMotion();

  return (
    <Animated.View
      entering={enter.drop(0)}
      style={[styles.largeTitle, { paddingTop: offset + Spacing.sm }, style]}
    >
      {eyebrow && (
        <AppText variant="label" tone="accent" style={styles.eyebrow}>
          {eyebrow}
        </AppText>
      )}
      <AppText
        variant="display"
        accessibilityRole="header"
        // Two lines keeps a long category name from pushing the list off-screen.
        numberOfLines={2}
      >
        {title}
      </AppText>
      {subtitle && (
        <AppText variant="small" tone="muted" style={styles.subtitle}>
          {subtitle}
        </AppText>
      )}
    </Animated.View>
  );
}

/** Height a screen should reserve at the top for the sticky bar. */
export function useStickyHeaderHeight() {
  const insets = useSafeAreaInsets();
  return insets.top + TouchTarget + Spacing.xs;
}

const styles = StyleSheet.create({
  stickyBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    justifyContent: "flex-end",
  },
  androidSurface: { backgroundColor: Palette.glass },
  hairline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Palette.border,
  },
  stickyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.sm,
    gap: Spacing.xs,
  },
  stickyTitle: { flex: 1, alignItems: "center" },
  largeTitle: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  eyebrow: { marginBottom: Spacing.xxs },
  subtitle: { marginTop: Spacing.xxs },
});
