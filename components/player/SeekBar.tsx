import { AppText } from "@/components/ui/AppText";
import {
  Duration,
  Easings,
  Palette,
  Radius,
  Spacing,
} from "@/constants/theme";
import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const TRACK_HEIGHT = 4;
const TRACK_HEIGHT_ACTIVE = 6;
const THUMB = 14;
/** Invisible padding so the 4px-tall bar still has a comfortable grab area. */
const HIT_HEIGHT = 44;

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

interface SeekBarProps {
  /** 0-1 playback position. Driven from the UI thread, not React state. */
  progress: SharedValue<number>;
  /** 0-1 buffered position. */
  buffered: SharedValue<number>;
  duration: number;
  currentTime: number;
  onSeek: (seconds: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
}

/**
 * Scrub bar.
 *
 * Progress is a shared value written straight from the player's `timeUpdate`
 * listener, so the bar animates on the UI thread without re-rendering the tree
 * four times a second.
 *
 * Dragging is not the only way to move: the bar exposes an `adjustable`
 * accessibility role with increment/decrement actions, so it is operable with a
 * screen reader or switch control where a pan gesture is not.
 */
export function SeekBar({
  progress,
  buffered,
  duration,
  currentTime,
  onSeek,
  onScrubStart,
  onScrubEnd,
}: SeekBarProps) {
  const [width, setWidth] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);

  const active = useSharedValue(0);
  const dragging = useSharedValue(false);

  const beginScrub = useCallback(() => {
    setScrubbing(true);
    onScrubStart();
  }, [onScrubStart]);

  const commitScrub = useCallback(
    (ratio: number) => {
      setScrubbing(false);
      onSeek(ratio * duration);
      onScrubEnd();
    },
    [duration, onSeek, onScrubEnd]
  );

  const previewScrub = useCallback(
    (ratio: number) => setScrubTime(ratio * duration),
    [duration]
  );

  const pan = Gesture.Pan()
    // Claim the gesture immediately so a horizontal drag scrubs instead of
    // being read as a tap on the surface underneath.
    .activeOffsetX([-4, 4])
    .onBegin((e) => {
      if (width <= 0) return;
      dragging.value = true;
      active.value = withTiming(1, { duration: Duration.instant });
      const ratio = Math.min(Math.max(e.x / width, 0), 1);
      progress.value = ratio;
      runOnJS(beginScrub)();
      runOnJS(previewScrub)(ratio);
    })
    .onUpdate((e) => {
      if (width <= 0) return;
      const ratio = Math.min(Math.max(e.x / width, 0), 1);
      progress.value = ratio;
      runOnJS(previewScrub)(ratio);
    })
    .onFinalize(() => {
      if (!dragging.value) return;
      dragging.value = false;
      active.value = withTiming(0, { duration: Duration.fast });
      runOnJS(commitScrub)(progress.value);
    });

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const bufferStyle = useAnimatedStyle(() => ({
    width: `${buffered.value * 100}%`,
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    left: `${progress.value * 100}%`,
    transform: [
      { translateX: -THUMB / 2 },
      { scale: 1 + active.value * 0.35 },
    ],
  }));

  const trackStyle = useAnimatedStyle(() => ({
    height: withTiming(
      TRACK_HEIGHT + active.value * (TRACK_HEIGHT_ACTIVE - TRACK_HEIGHT),
      { duration: Duration.instant, easing: Easings.out }
    ),
  }));

  const displayed = scrubbing ? scrubTime : currentTime;
  const remaining = Math.max(duration - displayed, 0);

  return (
    <View style={styles.container}>
      <GestureDetector gesture={pan}>
        <View
          style={styles.hitArea}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          accessibilityRole="adjustable"
          accessibilityLabel="Playback position"
          accessibilityValue={{
            min: 0,
            max: Math.max(Math.floor(duration), 1),
            now: Math.floor(displayed),
            text: `${formatTime(displayed)} of ${formatTime(duration)}`,
          }}
          // The keyboard/switch-control equivalent of dragging the thumb.
          accessibilityActions={[
            { name: "increment", label: "Forward 10 seconds" },
            { name: "decrement", label: "Back 10 seconds" },
          ]}
          onAccessibilityAction={(event) => {
            const delta = event.nativeEvent.actionName === "increment" ? 10 : -10;
            onSeek(Math.min(Math.max(displayed + delta, 0), duration));
          }}
        >
          <Animated.View style={[styles.track, trackStyle]}>
            <Animated.View style={[styles.buffer, bufferStyle]} />
            <Animated.View style={[styles.fill, fillStyle]} />
          </Animated.View>
          <Animated.View style={[styles.thumb, thumbStyle]} pointerEvents="none" />
        </View>
      </GestureDetector>

      <View style={styles.times} pointerEvents="none">
        <AppText variant="caption" style={styles.time}>
          {formatTime(displayed)}
        </AppText>
        <AppText variant="caption" style={styles.time}>
          -{formatTime(remaining)}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 2 },
  hitArea: { height: HIT_HEIGHT, justifyContent: "center" },
  track: {
    width: "100%",
    borderRadius: Radius.pill,
    backgroundColor: "rgba(248, 250, 252, 0.24)",
    overflow: "hidden",
  },
  buffer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(248, 250, 252, 0.38)",
  },
  fill: { height: "100%", backgroundColor: Palette.accent },
  thumb: {
    position: "absolute",
    width: THUMB,
    height: THUMB,
    borderRadius: Radius.pill,
    backgroundColor: Palette.accent,
  },
  times: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xxs,
  },
  // Tabular figures keep the timer from jittering as digits change.
  time: { color: Palette.foreground, fontVariant: ["tabular-nums"] },
});
