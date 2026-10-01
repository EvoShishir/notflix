/**
 * Typed text primitive.
 *
 * Screens pick a semantic variant instead of setting fontSize/weight/color by
 * hand, which keeps the Inter type scale and the dark-mode contrast ratios
 * consistent everywhere. Each variant caps its Dynamic Type multiplier: body copy
 * is allowed to grow further than display type, which would otherwise clip.
 */

import {
  FontFamily,
  FontSize,
  LineHeight,
  Palette,
} from "@/constants/theme";
import React from "react";
import { StyleProp, StyleSheet, Text, TextProps, TextStyle } from "react-native";

export type TextVariant =
  | "hero"
  | "display"
  | "headline"
  | "title"
  | "body"
  | "bodyStrong"
  | "small"
  | "micro"
  | "caption"
  | "label";

export type TextTone = "default" | "muted" | "subtle" | "accent" | "inverse";

const TONES: Record<TextTone, string> = {
  default: Palette.foreground,
  muted: Palette.mutedForeground,
  subtle: Palette.subtleForeground,
  accent: Palette.accent,
  inverse: Palette.background,
};

/** Larger type scales less — it already dominates the layout. */
const MAX_SCALE: Record<TextVariant, number> = {
  hero: 1.2,
  display: 1.2,
  headline: 1.3,
  title: 1.3,
  body: 1.6,
  bodyStrong: 1.6,
  small: 1.6,
  micro: 1.5,
  caption: 1.5,
  label: 1.4,
};

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

export function AppText({
  variant = "body",
  tone = "default",
  style,
  children,
  ...rest
}: AppTextProps) {
  return (
    <Text
      maxFontSizeMultiplier={MAX_SCALE[variant]}
      style={[styles[variant], { color: TONES[tone] }, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  hero: {
    fontFamily: FontFamily.extrabold,
    fontSize: FontSize.hero,
    lineHeight: LineHeight.hero,
    letterSpacing: -0.8,
  },
  display: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.display,
    lineHeight: LineHeight.display,
    letterSpacing: -0.6,
  },
  headline: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.headline,
    lineHeight: LineHeight.headline,
    letterSpacing: -0.4,
  },
  title: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.title,
    lineHeight: LineHeight.title,
    letterSpacing: -0.2,
  },
  body: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.body,
    lineHeight: LineHeight.body,
  },
  bodyStrong: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.bodyLg,
    lineHeight: LineHeight.bodyLg,
  },
  small: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.small,
    lineHeight: LineHeight.small,
  },
  micro: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.micro,
    lineHeight: LineHeight.micro,
  },
  caption: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.caption,
    lineHeight: LineHeight.caption,
  },
  /** Uppercase eyebrow / section label. */
  label: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.caption,
    lineHeight: LineHeight.caption,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
