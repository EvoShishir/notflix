/**
 * Empty and error states.
 *
 * Both give the user something to do rather than a dead end, announce themselves
 * to screen readers, and pair the icon with real text so meaning never rests on
 * the glyph or its color alone.
 */

import { IconSize, Palette, Radius, Spacing } from "@/constants/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { AppText } from "./AppText";
import { PrimaryButton } from "./Buttons";
import { useMotion } from "./Motion";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

interface StateViewProps {
  title: string;
  message?: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({
  title,
  message,
  icon = "film-outline",
  actionLabel,
  onAction,
  style,
}: StateViewProps) {
  const { enter } = useMotion();

  return (
    <Animated.View
      entering={enter.rise(0)}
      accessible
      accessibilityLabel={message ? `${title}. ${message}` : title}
      style={[styles.container, style]}
    >
      <View style={styles.iconWell}>
        <Ionicons
          name={icon}
          size={IconSize.xl}
          color={Palette.mutedForeground}
        />
      </View>
      <AppText variant="headline" style={styles.title}>
        {title}
      </AppText>
      {message && (
        <AppText variant="body" tone="muted" style={styles.message}>
          {message}
        </AppText>
      )}
      {actionLabel && onAction && (
        <PrimaryButton
          label={actionLabel}
          onPress={onAction}
          style={styles.action}
        />
      )}
    </Animated.View>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  style,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { enter } = useMotion();

  return (
    <Animated.View
      entering={enter.rise(0)}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={message ? `${title}. ${message}` : title}
      style={[styles.container, style]}
    >
      <View style={[styles.iconWell, styles.iconWellError]}>
        <Ionicons
          name="alert-circle-outline"
          size={IconSize.xl}
          color={Palette.destructive}
        />
      </View>
      <AppText variant="headline" style={styles.title}>
        {title}
      </AppText>
      {message && (
        <AppText variant="body" tone="muted" style={styles.message}>
          {message}
        </AppText>
      )}
      {onRetry && (
        <PrimaryButton
          label="Try again"
          icon="refresh"
          onPress={onRetry}
          style={styles.action}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
    gap: Spacing.xs,
  },
  iconWell: {
    width: 72,
    height: 72,
    borderRadius: Radius.pill,
    backgroundColor: Palette.muted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  iconWellError: { backgroundColor: "rgba(239, 68, 68, 0.12)" },
  title: { textAlign: "center" },
  /** Keeps long-form copy off the screen edges on tablets. */
  message: { textAlign: "center", maxWidth: 420 },
  action: { marginTop: Spacing.md },
});
