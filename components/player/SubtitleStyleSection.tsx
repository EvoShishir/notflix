import { AppText } from "@/components/ui/AppText";
import { PressableScale } from "@/components/ui/PressableScale";
import {
  IconSize,
  Palette,
  Radius,
  Spacing,
  TouchTarget,
} from "@/constants/theme";
import {
  POSITION_MAX,
  resetSubtitleStyle,
  sameSubtitleStyle,
  setSubtitleStyle,
  DEFAULT_SUBTITLE_STYLE,
  type SubtitleColor,
  type SubtitleOutline,
  type SubtitleSize,
  useSubtitleStyle,
} from "@/lib/subtitleStyle";
import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, View } from "react-native";

interface Choice<T> {
  value: T;
  label: string;
}

/** A row of mutually exclusive chips. */
function Segmented<T extends string | boolean>({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: Choice<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <View style={styles.row}>
      <AppText variant="micro" tone="muted">
        {label}
      </AppText>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {choices.map((choice) => {
          const active = choice.value === value;
          return (
            <PressableScale
              key={String(choice.value)}
              onPress={() => onChange(choice.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`${label}: ${choice.label}`}
              scaleTo={0.97}
              style={[styles.chip, active && styles.chipActive]}
            >
              <AppText variant="small" tone={active ? "default" : "muted"}>
                {choice.label}
              </AppText>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const SIZES: Choice<SubtitleSize>[] = [
  { value: "small", label: "S" },
  { value: "medium", label: "M" },
  { value: "large", label: "L" },
  { value: "xlarge", label: "XL" },
];

const COLORS: Choice<SubtitleColor>[] = [
  { value: "white", label: "White" },
  { value: "yellow", label: "Yellow" },
];

const OUTLINES: Choice<SubtitleOutline>[] = [
  { value: "none", label: "None" },
  { value: "thin", label: "Thin" },
  { value: "normal", label: "Normal" },
  { value: "thick", label: "Thick" },
];

const ON_OFF: Choice<boolean>[] = [
  { value: false, label: "Off" },
  { value: true, label: "On" },
];

interface SubtitleStyleSectionProps {
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Subtitle appearance.
 *
 * Changes are written straight to the store; the player debounces them and
 * reloads the stream at the same position, since libVLC only reads text-render
 * options when it starts. The video stays visible beside the panel, so the
 * result shows up live a moment after each tap.
 */
export function SubtitleStyleSection({
  expanded,
  onToggle,
}: SubtitleStyleSectionProps) {
  const style = useSubtitleStyle();
  const isDefault = sameSubtitleStyle(style, DEFAULT_SUBTITLE_STYLE);

  const sizeLabel = SIZES.find((s) => s.value === style.size)?.label ?? "M";
  const summary = isDefault ? "Default" : `Custom · size ${sizeLabel}`;

  return (
    <View style={styles.group}>
      <PressableScale
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`Subtitle style, ${summary}`}
        accessibilityState={{ expanded }}
        scaleTo={0.99}
        style={styles.trigger}
      >
        <View style={styles.triggerText}>
          <AppText variant="micro" tone="muted">
            Subtitle style
          </AppText>
          <AppText variant="body" numberOfLines={1}>
            {summary}
          </AppText>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={IconSize.md}
          color={Palette.mutedForeground}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </PressableScale>

      {expanded && (
        <View style={styles.panel}>
          <Segmented
            label="Size"
            choices={SIZES}
            value={style.size}
            onChange={(size) => setSubtitleStyle({ size })}
          />

          <View style={styles.row}>
            <AppText variant="micro" tone="muted">
              Vertical position
            </AppText>
            <View style={styles.stepper}>
              <PressableScale
                onPress={() =>
                  setSubtitleStyle({ position: Math.max(style.position - 1, 0) })
                }
                disabled={style.position <= 0}
                accessibilityRole="button"
                accessibilityLabel="Move subtitles down"
                style={styles.stepButton}
              >
                <Ionicons
                  name="arrow-down"
                  size={IconSize.md}
                  color={Palette.foreground}
                />
              </PressableScale>
              <AppText variant="body" style={styles.stepValue}>
                {style.position === 0 ? "Bottom" : `+${style.position}`}
              </AppText>
              <PressableScale
                onPress={() =>
                  setSubtitleStyle({
                    position: Math.min(style.position + 1, POSITION_MAX),
                  })
                }
                disabled={style.position >= POSITION_MAX}
                accessibilityRole="button"
                accessibilityLabel="Move subtitles up"
                style={styles.stepButton}
              >
                <Ionicons
                  name="arrow-up"
                  size={IconSize.md}
                  color={Palette.foreground}
                />
              </PressableScale>
            </View>
          </View>

          <Segmented
            label="Text colour"
            choices={COLORS}
            value={style.color}
            onChange={(color) => setSubtitleStyle({ color })}
          />
          <Segmented
            label="Outline"
            choices={OUTLINES}
            value={style.outline}
            onChange={(outline) => setSubtitleStyle({ outline })}
          />
          <Segmented
            label="Shadow"
            choices={ON_OFF}
            value={style.shadow}
            onChange={(shadow) => setSubtitleStyle({ shadow })}
          />
          <Segmented
            label="Background box"
            choices={ON_OFF}
            value={style.background}
            onChange={(background) => setSubtitleStyle({ background })}
          />
          <Segmented
            label="Bold"
            choices={ON_OFF}
            value={style.bold}
            onChange={(bold) => setSubtitleStyle({ bold })}
          />

          <AppText variant="caption" tone="muted" style={styles.note}>
            The video reloads briefly to apply changes. Styled .ass subtitles
            keep their own look.
          </AppText>

          {!isDefault && (
            <PressableScale
              onPress={resetSubtitleStyle}
              accessibilityRole="button"
              accessibilityLabel="Reset subtitle style to default"
              scaleTo={0.99}
              style={styles.reset}
            >
              <Ionicons
                name="refresh"
                size={IconSize.md}
                color={Palette.mutedForeground}
              />
              <AppText variant="small" tone="muted">
                Reset to default
              </AppText>
            </PressableScale>
          )}
        </View>
      )}
    </View>
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
  panel: { marginTop: Spacing.xs, paddingLeft: Spacing.xs, gap: Spacing.sm },
  row: { gap: Spacing.xxs, paddingHorizontal: Spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.xxs },
  chip: {
    minHeight: TouchTarget,
    minWidth: TouchTarget,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Palette.muted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
  chipActive: {
    backgroundColor: Palette.accentSoft,
    borderColor: Palette.accent,
  },
  stepper: { flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  stepButton: {
    width: TouchTarget,
    height: TouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.pill,
    backgroundColor: Palette.muted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
  stepValue: { minWidth: 64, textAlign: "center" },
  note: { paddingHorizontal: Spacing.xs },
  reset: {
    minHeight: TouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
});
