import { Palette, Radius } from "@/constants/theme";
import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

/**
 * A thin determinate bar.
 *
 * Used for watched progress on poster cards and for download progress. It is
 * decorative in both places — the surrounding card already carries the same
 * information in its accessibility label — so it stays out of the
 * accessibility tree rather than adding a second, redundant announcement.
 */
export function ProgressBar({
  fraction,
  color = Palette.accent,
  height = 3,
  track = "rgba(248, 250, 252, 0.22)",
  style,
}: {
  /** 0-1. Values outside the range are clamped. */
  fraction: number;
  color?: string;
  height?: number;
  track?: string;
  style?: ViewStyle;
}) {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  if (clamped <= 0) return null;

  return (
    <View
      style={[styles.track, { height, backgroundColor: track }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={[
          styles.fill,
          { backgroundColor: color, width: `${clamped * 100}%` },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: "100%",
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: Radius.pill },
});
