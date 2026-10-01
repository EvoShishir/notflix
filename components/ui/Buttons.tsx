/**
 * Buttons.
 *
 * All three variants share the same geometry and press spring, and all of them
 * meet the platform touch-target minimum (44pt iOS / 48dp Android) even when the
 * visible glyph is smaller. Icon-only buttons require an accessible label.
 */

import {
  Gradients,
  IconSize,
  Palette,
  Radius,
  Shadows,
  Spacing,
  TouchTarget,
} from "@/constants/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { AppText } from "./AppText";
import { PressableScale } from "./PressableScale";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

interface ButtonProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
  /** Stretch to fill the parent instead of hugging its content. */
  block?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Overrides the label when the visible text isn't descriptive on its own. */
  accessibilityLabel?: string;
}

/** Filled brand CTA. One per view — this is the primary action. */
export function PrimaryButton({
  label,
  onPress,
  icon,
  disabled,
  block,
  style,
  accessibilityLabel,
}: ButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.base, block && styles.block, Shadows.accentGlow, style]}
    >
      <LinearGradient
        colors={Gradients.accent}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {icon && (
        <Ionicons
          name={icon}
          size={IconSize.md}
          color={Palette.onAccent}
          // Decorative: the label right next to it already says what this does.
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
      <AppText variant="bodyStrong" style={{ color: Palette.onAccent }}>
        {label}
      </AppText>
    </PressableScale>
  );
}

/** Translucent secondary action. Sits on artwork without competing with the CTA. */
export function GhostButton({
  label,
  onPress,
  icon,
  disabled,
  block,
  style,
  accessibilityLabel,
}: ButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.base, styles.ghost, block && styles.block, style]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={IconSize.md}
          color={Palette.foreground}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
      <AppText variant="bodyStrong">{label}</AppText>
    </PressableScale>
  );
}

/**
 * Icon-only control. `label` is required and becomes the accessible name —
 * an icon button without one is unusable with a screen reader.
 */
export function IconButton({
  name,
  label,
  onPress,
  size = IconSize.lg,
  tone = "glass",
  style,
  disabled,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  size?: number;
  tone?: "glass" | "plain" | "accent";
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const color = tone === "accent" ? Palette.onAccent : Palette.foreground;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.iconButton,
        tone === "glass" && styles.iconGlass,
        tone === "accent" && styles.iconAccent,
        style,
      ]}
    >
      <Ionicons name={name} size={size} color={color} />
    </PressableScale>
  );
}

/** Small non-interactive metadata pill (quality, year, rating). */
export function Chip({
  label,
  icon,
  iconColor = Palette.star,
  style,
}: {
  label: string;
  icon?: IconName;
  iconColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.chip, style]}>
      {icon && (
        <Ionicons
          name={icon}
          size={IconSize.sm - 2}
          color={iconColor}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    overflow: "hidden",
  },
  block: { alignSelf: "stretch" },
  ghost: {
    backgroundColor: Palette.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.borderStrong,
  },
  iconButton: {
    width: TouchTarget,
    height: TouchTarget,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  iconGlass: {
    backgroundColor: Palette.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.borderStrong,
  },
  iconAccent: { backgroundColor: Palette.accent },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xxs,
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xxs,
    borderRadius: Radius.sm,
    backgroundColor: Palette.muted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
});
