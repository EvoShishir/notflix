import { AppText } from "@/components/ui/AppText";
import { useMotionEnabled } from "@/components/ui/Motion";
import { PressableScale } from "@/components/ui/PressableScale";
import {
  Duration,
  Easings,
  Gradients,
  IconSize,
  Palette,
  Radius,
  Spacing,
  TouchTarget,
} from "@/constants/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SeekBar } from "./SeekBar";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/**
 * Fixed reserve above the top bar, instead of the live top safe-area inset.
 *
 * The status bar is tied to control visibility, so `insets.top` collapses to 0
 * when it hides and grows again when it shows — which made the whole top bar
 * jump downwards mid-fade every time you tapped. A constant clears a landscape
 * status bar and never moves. Left/right insets still come from the live values,
 * because a landscape notch genuinely does sit on the side.
 */
const STATUS_BAR_RESERVE = 28;
type MaterialIconName = React.ComponentProps<typeof MaterialIcons>["name"];

/** A control that is icon-only, so it carries its own accessible name. */
function ControlButton({
  icon,
  materialIcon,
  label,
  onPress,
  size = IconSize.lg,
  variant = "plain",
  state,
}: {
  icon?: IconName;
  /** Use when the glyph only exists in MaterialIcons (the circular seek arrows). */
  materialIcon?: MaterialIconName;
  label: string;
  onPress: () => void;
  size?: number;
  variant?: "plain" | "primary";
  state?: { selected?: boolean };
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={state}
      style={[styles.control, variant === "primary" && styles.controlPrimary]}
    >
      {materialIcon ? (
        <MaterialIcons
          name={materialIcon}
          size={size}
          color={Palette.foreground}
        />
      ) : (
        <Ionicons name={icon!} size={size} color={Palette.foreground} />
      )}
    </PressableScale>
  );
}

interface VideoControlsProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  playing: boolean;
  loading: boolean;
  duration: number;
  currentTime: number;
  progress: SharedValue<number>;
  buffered: SharedValue<number>;
  zoomed: boolean;
  subtitlesOn: boolean;
  onTogglePlay: () => void;
  onSeekTo: (seconds: number) => void;
  onSeekBy: (seconds: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
  onToggleZoom: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

/**
 * The control overlay.
 *
 * It fades in and out as a single layer and becomes non-interactive while
 * hidden, so a hidden control can never swallow the tap meant for the video
 * surface underneath. Scrims top and bottom keep the buttons legible over bright
 * footage without dimming the picture as a whole.
 */
export function VideoControls({
  visible,
  title,
  subtitle,
  playing,
  loading,
  duration,
  currentTime,
  progress,
  buffered,
  zoomed,
  subtitlesOn,
  onTogglePlay,
  onSeekTo,
  onSeekBy,
  onScrubStart,
  onScrubEnd,
  onToggleZoom,
  onOpenSettings,
  onClose,
}: VideoControlsProps) {
  const insets = useSafeAreaInsets();
  const motion = useMotionEnabled();

  /**
   * Fade driven by a shared value in an effect, not derived inline from the
   * `visible` prop.
   *
   * Deriving it meant every unrelated re-render (the clock ticks once a second)
   * restarted the timing from wherever it was, so the fade stuttered and often
   * read as a snap. Animating one shared value makes it continuous and
   * interruptible — tapping mid-fade reverses smoothly from the current opacity
   * instead of jumping.
   *
   * The overlay also drifts a few pixels as it goes, which reads as settling
   * into place rather than blinking on. Fading out is quicker than fading in,
   * so dismissing never feels sluggish.
   */
  const shown = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    shown.value = withTiming(visible ? 1 : 0, {
      duration: motion ? (visible ? Duration.base : Duration.fast) : 0,
      easing: visible ? Easings.out : Easings.in,
    });
  }, [visible, motion, shown]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: shown.value }));

  const topStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - shown.value) * -12 }],
  }));

  const bottomStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - shown.value) * 12 }],
  }));

  const centerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.94 + shown.value * 0.06 }],
  }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, overlayStyle]}
      // Hidden controls must not intercept taps meant for the seek gestures.
      pointerEvents={visible ? "box-none" : "none"}
      // ...nor be reachable by a screen reader while invisible.
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
    >
      <LinearGradient
        colors={Gradients.topScrim}
        style={styles.topScrim}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[...Gradients.topScrim].reverse() as [string, string]}
        style={styles.bottomScrim}
        pointerEvents="none"
      />

      {/* Top bar: exit, what's playing, settings. */}
      <Animated.View
        style={[
          styles.top,
          topStyle,
          {
            paddingTop: STATUS_BAR_RESERVE,
            paddingLeft: insets.left + Spacing.xs,
            paddingRight: insets.right + Spacing.xs,
          },
        ]}
      >
        <ControlButton icon="chevron-down" label="Close player" onPress={onClose} />

        <View style={styles.titleBlock} pointerEvents="none">
          <AppText variant="bodyStrong" numberOfLines={1}>
            {title}
          </AppText>
          {!!subtitle && (
            <AppText variant="micro" tone="muted" numberOfLines={1}>
              {subtitle}
            </AppText>
          )}
        </View>

        <ControlButton
          icon="settings-outline"
          label={
            subtitlesOn
              ? "Audio and subtitles, subtitles on"
              : "Audio and subtitles"
          }
          onPress={onOpenSettings}
          state={{ selected: subtitlesOn }}
        />
      </Animated.View>

      {/* Transport: back 10, play/pause, forward 10. */}
      <Animated.View
        style={[styles.center, centerStyle]}
        pointerEvents="box-none"
      >
        <ControlButton
          materialIcon="replay-10"
          label="Back 10 seconds"
          onPress={() => onSeekBy(-10)}
          size={IconSize.xl + 8}
        />

        {loading ? (
          <View style={[styles.control, styles.controlPrimary]}>
            <ActivityIndicator
              size="large"
              color={Palette.foreground}
              accessibilityLabel="Buffering"
            />
          </View>
        ) : (
          <ControlButton
            icon={playing ? "pause" : "play"}
            label={playing ? "Pause" : "Play"}
            onPress={onTogglePlay}
            size={IconSize.xl + 6}
            variant="primary"
          />
        )}

        <ControlButton
          materialIcon="forward-10"
          label="Forward 10 seconds"
          onPress={() => onSeekBy(10)}
          size={IconSize.xl + 8}
        />
      </Animated.View>

      {/* Bottom bar: scrub bar and aspect toggle. */}
      <Animated.View
        style={[
          styles.bottom,
          bottomStyle,
          {
            paddingBottom: Math.max(insets.bottom, Spacing.sm),
            paddingLeft: insets.left + Spacing.md,
            paddingRight: insets.right + Spacing.md,
          },
        ]}
      >
        <View style={styles.seekRow}>
          <View style={styles.seekBar}>
            <SeekBar
              progress={progress}
              buffered={buffered}
              duration={duration}
              currentTime={currentTime}
              onSeek={onSeekTo}
              onScrubStart={onScrubStart}
              onScrubEnd={onScrubEnd}
            />
          </View>
          <ControlButton
            icon={zoomed ? "contract-outline" : "expand-outline"}
            label={zoomed ? "Fit video to screen" : "Zoom video to fill screen"}
            onPress={onToggleZoom}
            state={{ selected: zoomed }}
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  topScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 160 },
  bottomScrim: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  titleBlock: { flex: 1, alignItems: "center" },
  center: {
    ...StyleSheet.absoluteFill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xxl,
  },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
  seekRow: { flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  seekBar: { flex: 1 },
  control: {
    minWidth: TouchTarget,
    minHeight: TouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.pill,
  },
  controlPrimary: {
    width: 76,
    height: 76,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.borderStrong,
  },
});
