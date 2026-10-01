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
  formatOffset,
  OFFSET_LIMIT,
  OFFSET_STEP,
  SUBTITLE_EXTENSIONS,
} from "@/lib/subtitles";
import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

interface ExternalSubtitlesProps {
  /** Name of the loaded file, or null when none is loaded. */
  activeLabel: string | null;
  loading: boolean;
  error: string | null;
  expanded: boolean;
  onToggle: () => void;
  /** Opens the system file picker. */
  onPick: () => void;
  onClear: () => void;
  offset: number;
  onOffsetChange: (next: number) => void;
}

/** One step of the sync nudger. */
function OffsetButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.offsetButton}
    >
      <Ionicons name={icon} size={IconSize.md} color={Palette.foreground} />
    </PressableScale>
  );
}

/**
 * Load a subtitle file from the device, plus the sync nudger.
 *
 * The timing control is not a nicety: a subtitle file was timed against some
 * particular release, and it routinely runs a second or two out against whatever
 * copy is actually playing. Being able to shift it is what makes an external
 * file usable at all.
 */
export function ExternalSubtitles({
  activeLabel,
  loading,
  error,
  expanded,
  onToggle,
  onPick,
  onClear,
  offset,
  onOffsetChange,
}: ExternalSubtitlesProps) {
  const nudge = (delta: number) =>
    onOffsetChange(
      Math.min(Math.max(offset + delta, -OFFSET_LIMIT), OFFSET_LIMIT)
    );

  return (
    <View style={styles.group}>
      <PressableScale
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`Subtitle file, ${activeLabel ?? "none loaded"}`}
        accessibilityState={{ expanded }}
        scaleTo={0.99}
        style={styles.trigger}
      >
        <View style={styles.triggerText}>
          <AppText variant="micro" tone="muted">
            Subtitle file
          </AppText>
          <AppText variant="body" numberOfLines={1}>
            {activeLabel ?? "Load from device"}
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
          <PressableScale
            onPress={onPick}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Choose a subtitle file from this device"
            scaleTo={0.99}
            style={styles.searchButton}
          >
            {loading ? (
              <ActivityIndicator size="small" color={Palette.foreground} />
            ) : (
              <Ionicons
                name="folder-open-outline"
                size={IconSize.md}
                color={Palette.foreground}
              />
            )}
            <AppText variant="body">
              {loading ? "Loading…" : "Choose file…"}
            </AppText>
          </PressableScale>

          <AppText variant="caption" tone="muted" style={styles.note}>
            Supports {SUBTITLE_EXTENSIONS.map((e) => e.slice(1)).join(", ")}
          </AppText>

          {error && (
            <AppText
              variant="small"
              tone="accent"
              style={styles.note}
              accessibilityLiveRegion="polite"
            >
              {error}
            </AppText>
          )}

          {activeLabel && (
            <>
              {/* Sync nudger — only meaningful once a file is actually loaded. */}
              <View style={styles.sync}>
                <View style={styles.syncText}>
                  <AppText variant="micro" tone="muted">
                    Subtitle timing
                  </AppText>
                  <AppText variant="body">{formatOffset(offset)}</AppText>
                  <AppText variant="caption" tone="muted">
                    {offset > 0
                      ? "Subtitles appear later"
                      : offset < 0
                        ? "Subtitles appear earlier"
                        : "Matching the video"}
                  </AppText>
                </View>

                <View style={styles.syncControls}>
                  <OffsetButton
                    icon="remove"
                    label={`Shift subtitles ${OFFSET_STEP} seconds earlier`}
                    onPress={() => nudge(-OFFSET_STEP)}
                    disabled={offset <= -OFFSET_LIMIT}
                  />
                  <OffsetButton
                    icon="refresh"
                    label="Reset subtitle timing"
                    onPress={() => onOffsetChange(0)}
                    disabled={offset === 0}
                  />
                  <OffsetButton
                    icon="add"
                    label={`Shift subtitles ${OFFSET_STEP} seconds later`}
                    onPress={() => nudge(OFFSET_STEP)}
                    disabled={offset >= OFFSET_LIMIT}
                  />
                </View>
              </View>

              <PressableScale
                onPress={onClear}
                accessibilityRole="button"
                accessibilityLabel="Remove the loaded subtitle file"
                scaleTo={0.99}
                style={styles.clear}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={IconSize.md}
                  color={Palette.mutedForeground}
                />
                <AppText variant="small" tone="muted">
                  Remove this subtitle file
                </AppText>
              </PressableScale>
            </>
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
  panel: { marginTop: Spacing.xxs, paddingLeft: Spacing.xs, gap: Spacing.xxs },
  searchButton: {
    minHeight: TouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Palette.accentSoft,
  },
  note: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
  sync: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
    backgroundColor: Palette.muted,
  },
  syncText: { flex: 1, gap: 2 },
  syncControls: { flexDirection: "row", alignItems: "center", gap: Spacing.xxs },
  offsetButton: {
    width: TouchTarget,
    height: TouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.pill,
    backgroundColor: Palette.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
  clear: {
    minHeight: TouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
});
