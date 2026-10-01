import { AppText } from "@/components/ui/AppText";
import { useMotionEnabled } from "@/components/ui/Motion";
import { PressableScale } from "@/components/ui/PressableScale";
import {
  Duration,
  Easings,
  IconSize,
  Palette,
  Radius,
  Spacing,
  TouchTarget,
} from "@/constants/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

export interface DropdownOption {
  key: string;
  label: string;
  sublabel?: string;
}

interface OptionDropdownProps {
  /** Row label, e.g. "Audio track". */
  title: string;
  /** Shown collapsed, so the current choice is readable without opening. */
  valueLabel: string;
  options: DropdownOption[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  expanded: boolean;
  onToggle: () => void;
  /** Shown in place of the list when there is nothing to choose from. */
  emptyMessage?: string;
}

/**
 * A collapsed row that expands into its options.
 *
 * Keeping each group closed by default means the sheet opens showing what is
 * currently selected, one line per setting, instead of a wall of every possible
 * track at once. The trigger carries `expanded` state so a screen reader
 * announces it as a collapsible control rather than a plain button.
 */
export function OptionDropdown({
  title,
  valueLabel,
  options,
  selectedKey,
  onSelect,
  expanded,
  onToggle,
  emptyMessage,
}: OptionDropdownProps) {
  const motion = useMotionEnabled();
  const rotation = useSharedValue(expanded ? 1 : 0);

  // In an effect, not the render body: writing to a shared value while React is
  // rendering is what produced the "[Reanimated] Writing to `value` during
  // component render" warning, and can drop the animation entirely.
  useEffect(() => {
    rotation.value = motion
      ? withTiming(expanded ? 1 : 0, {
          duration: Duration.fast,
          easing: Easings.out,
        })
      : expanded
        ? 1
        : 0;
  }, [expanded, motion, rotation]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 180}deg` }],
  }));

  const handleSelect = useCallback(
    (key: string) => {
      onSelect(key);
      onToggle();
    },
    [onSelect, onToggle]
  );

  return (
    <Animated.View
      layout={
        motion
          ? LinearTransition.duration(Duration.base).easing(Easings.out)
          : undefined
      }
      style={styles.group}
    >
      <PressableScale
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${valueLabel}`}
        accessibilityHint={expanded ? "Collapses the list" : "Expands the list"}
        accessibilityState={{ expanded }}
        scaleTo={0.99}
        style={styles.trigger}
      >
        <View style={styles.triggerText}>
          <AppText variant="micro" tone="muted">
            {title}
          </AppText>
          <AppText variant="body" numberOfLines={1}>
            {valueLabel}
          </AppText>
        </View>

        <Animated.View style={chevronStyle}>
          <Ionicons
            name="chevron-down"
            size={IconSize.md}
            color={Palette.mutedForeground}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Animated.View>
      </PressableScale>

      {expanded && (
        <Animated.View
          entering={motion ? FadeIn.duration(Duration.fast) : undefined}
          exiting={motion ? FadeOut.duration(Duration.instant) : undefined}
          style={styles.list}
          accessibilityRole="radiogroup"
        >
          {options.length === 0 && emptyMessage ? (
            <AppText variant="small" tone="muted" style={styles.empty}>
              {emptyMessage}
            </AppText>
          ) : (
            options.map((option) => {
              const selected = option.key === selectedKey;
              return (
                <PressableScale
                  key={option.key}
                  onPress={() => handleSelect(option.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, selected }}
                  accessibilityLabel={
                    option.sublabel
                      ? `${option.label}, ${option.sublabel}`
                      : option.label
                  }
                  scaleTo={0.99}
                  style={[styles.option, selected && styles.optionSelected]}
                >
                  <View style={styles.optionText}>
                    <AppText variant="body" numberOfLines={1}>
                      {option.label}
                    </AppText>
                    {option.sublabel && (
                      <AppText variant="micro" tone="muted">
                        {option.sublabel}
                      </AppText>
                    )}
                  </View>

                  {/* Checkmark as well as the tint — selection never rests on
                      colour alone. */}
                  {selected && (
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
            })
          )}
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: Spacing.xs },
  trigger: {
    minHeight: TouchTarget + Spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.lg,
    backgroundColor: Palette.muted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
  triggerText: { flex: 1, gap: 2 },
  list: { marginTop: Spacing.xxs, paddingLeft: Spacing.xs },
  option: {
    minHeight: TouchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
    marginBottom: Spacing.xxs,
    borderRadius: Radius.md,
  },
  optionSelected: { backgroundColor: Palette.accentSoft },
  optionText: { flex: 1, gap: 2 },
  empty: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
});
