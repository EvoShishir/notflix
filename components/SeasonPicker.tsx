import {
  Duration,
  Easings,
  IconSize,
  Palette,
  Radius,
  Spacing,
  TouchTarget,
} from "@/constants/theme";
import { Season } from "@/types";
import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScreenHeight } from "@/hooks/useScreenHeight";
import { AppText } from "./ui/AppText";
import { useMotionEnabled } from "./ui/Motion";
import { PressableScale } from "./ui/PressableScale";

interface SeasonPickerProps {
  seasons: Season[];
  selected: number;
  onSelect: (seasonNumber: number) => void;
}

/**
 * Season selector.
 *
 * A dropdown trigger that opens a bottom sheet of seasons, rather than making
 * people swipe through one shelf per season to find episode 4 of season 6. The
 * sheet is a real `Modal`, so Android's back button and the system's
 * focus-trapping both work without extra wiring.
 */
export function SeasonPicker({
  seasons,
  selected,
  onSelect,
}: SeasonPickerProps) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const screenHeight = useScreenHeight();
  const motion = useMotionEnabled();
  const chevron = useSharedValue(0);

  const current =
    seasons.find((s) => s.seasonNumber === selected) ?? seasons[0];

  const toggle = useCallback(
    (next: boolean) => {
      setOpen(next);
      chevron.value = motion
        ? withTiming(next ? 1 : 0, {
            duration: Duration.fast,
            easing: Easings.out,
          })
        : next
          ? 1
          : 0;
    },
    [chevron, motion]
  );

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevron.value * 180}deg` }],
  }));

  const handleSelect = useCallback(
    (seasonNumber: number) => {
      onSelect(seasonNumber);
      toggle(false);
    },
    [onSelect, toggle]
  );

  if (seasons.length === 0) return null;

  return (
    <>
      <PressableScale
        onPress={() => toggle(true)}
        // Single-season shows have nothing to pick, so the control is inert.
        disabled={seasons.length === 1}
        accessibilityRole="button"
        accessibilityLabel={`Season ${current.seasonNumber}`}
        accessibilityHint={
          seasons.length === 1 ? undefined : "Opens the season list"
        }
        accessibilityState={{ expanded: open, disabled: seasons.length === 1 }}
        scaleTo={0.98}
        style={styles.trigger}
      >
        <View style={styles.triggerText}>
          <AppText variant="label" tone="muted">
            Season
          </AppText>
          <AppText variant="bodyStrong" numberOfLines={1}>
            Season {current.seasonNumber}
          </AppText>
        </View>

        <View style={styles.triggerMeta}>
          <AppText variant="micro" tone="muted">
            {current.episodes.length} ep
            {current.episodes.length === 1 ? "" : "s"}
          </AppText>
          {seasons.length > 1 && (
            <Animated.View style={chevronStyle}>
              <Ionicons
                name="chevron-down"
                size={IconSize.md}
                color={Palette.foreground}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            </Animated.View>
          )}
        </View>
      </PressableScale>

      <Modal
        visible={open}
        transparent
        animationType="none"
        statusBarTranslucent
        // Handles the Android hardware back button and the iOS swipe-to-dismiss.
        onRequestClose={() => toggle(false)}
      >
        <Animated.View
          entering={motion ? FadeIn.duration(Duration.fast) : undefined}
          exiting={motion ? FadeOut.duration(Duration.instant) : undefined}
          style={[styles.backdrop, { height: screenHeight }]}
        >
          {/* Tapping outside closes — the sheet below stops the press. */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => toggle(false)}
            accessibilityRole="button"
            accessibilityLabel="Close season list"
          />

          <Animated.View
            entering={
              motion
                ? SlideInDown.duration(Duration.base)
                    .easing(Easings.out)
                    .reduceMotion(ReduceMotion.System)
                : undefined
            }
            exiting={
              motion
                ? SlideOutDown.duration(Duration.fast).easing(Easings.in)
                : undefined
            }
            style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.md }]}
            accessibilityViewIsModal
          >
            <View style={styles.grabber} />
            <AppText
              variant="title"
              accessibilityRole="header"
              style={styles.sheetTitle}
            >
              Select a season
            </AppText>

            <ScrollView
              style={styles.sheetScroll}
              showsVerticalScrollIndicator={false}
            >
              <View accessibilityRole="radiogroup">
                {seasons.map((season) => {
                  const active = season.seasonNumber === selected;
                  return (
                    <PressableScale
                      key={season.seasonNumber}
                      onPress={() => handleSelect(season.seasonNumber)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active, selected: active }}
                      accessibilityLabel={`Season ${season.seasonNumber}, ${season.episodes.length} episodes`}
                      scaleTo={0.99}
                      style={[styles.option, active && styles.optionActive]}
                    >
                      <View style={styles.optionText}>
                        <AppText variant="body">
                          Season {season.seasonNumber}
                        </AppText>
                        <AppText variant="micro" tone="muted">
                          {season.episodes.length} episode
                          {season.episodes.length === 1 ? "" : "s"}
                        </AppText>
                      </View>

                      {/* A checkmark, not just a tint — colour alone is never
                          the only signal for the selected row. */}
                      {active && (
                        <Ionicons
                          name="checkmark-circle"
                          size={IconSize.lg}
                          color={Palette.accent}
                          accessibilityElementsHidden
                          importantForAccessibility="no"
                        />
                      )}
                    </PressableScale>
                  );
                })}
              </View>
            </ScrollView>
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: TouchTarget + Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.lg,
    backgroundColor: Palette.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
  triggerText: { flex: 1, gap: 2 },
  triggerMeta: { flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  backdrop: {
    // Height comes from useScreenHeight; flex: 1 stops short on Android.
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    justifyContent: "flex-end",
    // Measured against the page's true-black ground: dark enough to push the
    // page back without hiding that it is still there.
    backgroundColor: "rgba(0, 0, 0, 0.72)",
  },
  sheet: {
    backgroundColor: Palette.card,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.borderStrong,
    paddingTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    maxHeight: "70%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: Radius.pill,
    backgroundColor: Palette.borderStrong,
    marginBottom: Spacing.sm,
  },
  sheetTitle: { paddingHorizontal: Spacing.xs, marginBottom: Spacing.xs },
  sheetScroll: { flexGrow: 0 },
  option: {
    minHeight: TouchTarget + Spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.xxs,
    borderRadius: Radius.md,
  },
  optionActive: { backgroundColor: Palette.accentSoft },
  optionText: { flex: 1, gap: 2 },
});
