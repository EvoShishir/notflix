import { AppText } from "@/components/ui/AppText";
import { useMotionEnabled } from "@/components/ui/Motion";
import {
  Duration,
  Easings,
  IconSize,
  Palette,
  Radius,
  Spacing,
} from "@/constants/theme";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Brightness from "expo-brightness";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform, StyleSheet, View } from "react-native";
import { getPlayerPrefs, setPlayerPrefs } from "@/lib/playerPrefs";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { formatTime } from "./SeekBar";

export const SEEK_STEP = 10;
/** Taps inside this window after a double tap keep adding to the same seek. */
const CHAIN_MS = 800;
/**
 * The volume swipe's range: 0–100% is the phone's media volume, 100–200% is
 * libVLC's software boost on top of a maxed-out phone.
 */
export const VOLUME_MAX = 200;
/** Fraction of the screen height a swipe must cover to sweep the full range. */
const SWIPE_SPAN = 0.75;
/**
 * Width of each edge strip that takes vertical swipes: brightness on the left,
 * volume on the right. The middle is left to seeking alone, so a scrub that
 * starts a little steep doesn't turn into a volume change.
 */
const LEVEL_ZONE = 0.2;
/** Fixed so the meter doesn't resize as its label goes from "5%" to "200%". */
const LEVEL_WIDTH = 64;
/** Height of the brightness / volume level bars. */
const BAR_HEIGHT = 140;

/** Gesture modes, as numbers because they live in a shared value. */
const NONE = 0;
/** Activated, but the direction isn't known until the first movement update. */
const PENDING = 4;
const SEEK = 1;
const BRIGHTNESS = 2;
const VOLUME = 3;

type Side = "back" | "forward";

/**
 * How far a horizontal swipe seeks, in seconds, for a fraction of the screen
 * width. Quadratic on top of linear: small movements stay precise (a tenth of
 * the width is ~11s), long ones cover ground (half is ~1.5 min, the full width
 * 5 min) — the curve MX Player and VLC both use in spirit.
 */
function swipeSeconds(fraction: number) {
  "worklet";
  const magnitude = Math.abs(fraction);
  return Math.sign(fraction) * (90 * magnitude + 210 * magnitude * magnitude);
}

function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.min(Math.max(value, min), max);
}

function formatDelta(seconds: number) {
  return `${seconds < 0 ? "−" : "+"}${formatTime(Math.abs(seconds))}`;
}

interface PlayerGesturesProps {
  /** Total length in seconds; 0 until known, which disables swipe-seek. */
  duration: number;
  /** Playback position as a 0–1 fraction, shared with the seek bar. */
  progress: SharedValue<number>;
  /** Combined volume, 0–VOLUME_MAX: phone volume up to 100, boost above. */
  volume: number;
  onVolumeChange: (volume: number) => void;
  /**
   * Called as a touch lands, so the volume can be re-read before a swipe
   * starts from it — the hardware buttons may have moved it since.
   */
  onVolumeTouch?: () => void;
  /** Relative seek. Must not reveal the controls. */
  onSeekBy: (seconds: number) => void;
  /** Absolute seek. Must not reveal the controls. */
  onSeekTo: (seconds: number) => void;
  /** A lone tap — toggles the controls. */
  onSingleTap: () => void;
  /** Rendered above the gesture layer (the controls overlay). */
  children?: React.ReactNode;
}

/** A vertical level meter shown while swiping brightness or volume. */
function LevelBar({
  icon,
  label,
  level,
  boost,
  opacity,
  side,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  /** 0–1 fill. */
  level: SharedValue<number>;
  /** Fill above this fraction is drawn in the accent, to read as "boost". */
  boost?: number;
  opacity: SharedValue<number>;
  side: "left" | "right";
}) {
  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const fillStyle = useAnimatedStyle(() => ({
    height: level.value * BAR_HEIGHT,
    backgroundColor:
      boost !== undefined && level.value > boost
        ? Palette.accent
        : Palette.foreground,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.level,
        side === "left" ? styles.levelLeft : styles.levelRight,
        containerStyle,
      ]}
    >
      <MaterialIcons
        name={icon}
        size={IconSize.lg}
        color={Palette.foreground}
      />
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]} />
        {boost !== undefined && (
          <View style={[styles.tick, { bottom: boost * BAR_HEIGHT }]} />
        )}
      </View>
      <AppText variant="micro" style={styles.levelLabel}>
        {label}
      </AppText>
    </Animated.View>
  );
}

/**
 * Every touch on the video surface that isn't a control.
 *
 * - **Double tap** a half to seek 10s; keep tapping to add 10s per tap.
 * - **Swipe horizontally** to scrub, with a live readout; seeks on release.
 * - **Swipe vertically** in the left 20% for brightness, right 20% for volume.
 * - **Single tap** toggles the controls.
 *
 * None of the gestures bring the controls up — they show their own transient
 * feedback instead, so watching is never interrupted.
 */
export function PlayerGestures({
  duration,
  progress,
  volume,
  onVolumeChange,
  onVolumeTouch,
  onSeekBy,
  onSeekTo,
  onSingleTap,
  children,
}: PlayerGesturesProps) {
  const motion = useMotionEnabled();

  /* ------------------------------ double tap ------------------------------ */

  const [side, setSide] = useState<Side | null>(null);
  const [amount, setAmount] = useState(0);

  const chainRef = useRef<{
    side: Side | null;
    amount: number;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ side: null, amount: 0, timer: null });

  const backPulse = useSharedValue(0);
  const forwardPulse = useSharedValue(0);

  // Worklets need the surface size to tell left from right and to scale swipes.
  const surfaceWidth = useSharedValue(0);
  const surfaceHeight = useSharedValue(0);

  useEffect(() => {
    // Capture the ref object once; reading `.current` inside the cleanup would
    // read whatever it holds at unmount, which is not necessarily this chain.
    const chain = chainRef.current;
    return () => {
      if (chain.timer) clearTimeout(chain.timer);
    };
  }, []);

  const tapSeek = useCallback(
    (which: Side, steps: number) => {
      const chain = chainRef.current;
      if (chain.timer) clearTimeout(chain.timer);

      // Switching sides mid-chain restarts the count rather than subtracting
      // from the previous direction's total.
      const seconds = SEEK_STEP * steps;
      const next = chain.side === which ? chain.amount + seconds : seconds;
      chain.side = which;
      chain.amount = next;

      setSide(which);
      setAmount(next);
      onSeekBy(which === "forward" ? seconds : -seconds);

      const pulse = which === "back" ? backPulse : forwardPulse;
      pulse.value = motion
        ? withSequence(
            withTiming(1, { duration: Duration.instant, easing: Easings.out }),
            withTiming(0, { duration: Duration.slow, easing: Easings.in })
          )
        : 0;

      chain.timer = setTimeout(() => {
        chain.side = null;
        chain.amount = 0;
        setSide(null);
      }, CHAIN_MS);
    },
    [onSeekBy, motion, backPulse, forwardPulse]
  );

  /**
   * Taps after a double tap keep seeking instead of toggling the controls.
   * Without this, the third tap of a quick triple tap was read as a single
   * tap, and the controls popped up mid-seek.
   */
  const handleDoubleTap = useCallback(
    (x: number, width: number) => {
      const which: Side = x < width / 2 ? "back" : "forward";
      // Mid-chain, both taps count; starting fresh, the pair is one step.
      tapSeek(which, chainRef.current.side ? 2 : 1);
    },
    [tapSeek]
  );

  const handleSingleTap = useCallback(
    (x: number, width: number) => {
      if (chainRef.current.side) {
        tapSeek(x < width / 2 ? "back" : "forward", 1);
      } else {
        onSingleTap();
      }
    },
    [tapSeek, onSingleTap]
  );

  /* ------------------------------ brightness ------------------------------ */

  const brightness = useSharedValue(0.5);
  const [brightnessPct, setBrightnessPct] = useState(50);

  /**
   * Brightness applies to this window only on Android, and is handed back to
   * the system setting on the way out. iOS has no per-app brightness, so the
   * original level is restored instead.
   *
   * The level last set in the player comes back on the next open; until one
   * has been set, it starts from wherever the screen already is.
   */
  useEffect(() => {
    let active = true;
    let original: number | null = null;
    const saved = getPlayerPrefs().brightness;

    // Read the current level first even when restoring a saved one: on iOS it
    // is the system level, and it has to be put back on the way out.
    Brightness.getBrightnessAsync()
      .then((value) => {
        // Closed before this resolved: dimming now would outlive the player.
        if (!active) return;
        original = value;
        const start = saved ?? value;
        brightness.value = start;
        setBrightnessPct(Math.round(start * 100));
        if (saved !== null) {
          Brightness.setBrightnessAsync(saved).catch(() => {});
        }
      })
      .catch(() => {});

    return () => {
      active = false;
      if (Platform.OS === "android") {
        Brightness.restoreSystemBrightnessAsync().catch(() => {});
      } else if (original !== null) {
        Brightness.setBrightnessAsync(original).catch(() => {});
      }
    };
  }, [brightness]);

  const applyBrightness = useCallback((value: number) => {
    setBrightnessPct(Math.round(value * 100));
    Brightness.setBrightnessAsync(value).catch(() => {});
    setPlayerPrefs({ brightness: value });
  }, []);

  /* -------------------------------- volume -------------------------------- */

  const volumeLevel = useSharedValue(volume);

  useEffect(() => {
    volumeLevel.value = volume;
  }, [volume, volumeLevel]);

  /* ------------------------------ swipe seek ------------------------------ */

  const durationValue = useSharedValue(duration);

  useEffect(() => {
    durationValue.value = duration;
  }, [duration, durationValue]);

  const [seekPreview, setSeekPreview] = useState({ target: 0, delta: 0 });

  const updateSeekPreview = useCallback((target: number, delta: number) => {
    setSeekPreview({ target, delta });
  }, []);

  /* ------------------------------- gestures ------------------------------- */

  const mode = useSharedValue(NONE);
  const startX = useSharedValue(0);
  const base = useSharedValue(0);
  const seekStart = useSharedValue(0);
  const seekTarget = useSharedValue(0);
  const lastBrightnessSent = useSharedValue(-1);

  const seekOpacity = useSharedValue(0);
  const brightnessOpacity = useSharedValue(0);
  const volumeOpacity = useSharedValue(0);

  const brightnessFill = useSharedValue(0.5);
  const volumeFill = useSharedValue(volume / VOLUME_MAX);

  /**
   * Built once rather than on every render.
   *
   * Gesture objects are not cheap to reconstruct, and rebuilding them mid-touch
   * can drop the gesture. Callbacks they reach through `runOnJS` are stable
   * `useCallback`s, so the memo rarely invalidates.
   */
  const gesture = useMemo(() => {
    const show = { duration: Duration.instant };
    const hide = { duration: Duration.base };

    const pan = Gesture.Pan()
      .minDistance(14)
      .onBegin((e) => {
        startX.value = e.x;
        if (onVolumeTouch && e.x > surfaceWidth.value * (1 - LEVEL_ZONE)) {
          runOnJS(onVolumeTouch)();
        }
      })
      .onStart(() => {
        // The activation event reports a translation of 0,0, so the direction
        // can't be read here — deciding on it sent every swipe down the
        // vertical path, which is why horizontal seeking never started.
        mode.value = PENDING;
      })
      .onUpdate((e) => {
        if (mode.value === PENDING) {
          // The direction of the first real movement decides the gesture for
          // its whole length, so a slightly diagonal scrub never flips into volume.
          const dx = Math.abs(e.translationX);
          const dy = Math.abs(e.translationY);
          if (dx === 0 && dy === 0) return;

          if (dx > dy) {
            if (durationValue.value <= 0) {
              mode.value = NONE;
              return;
            }
            mode.value = SEEK;
            seekStart.value = progress.value * durationValue.value;
            seekTarget.value = seekStart.value;
            runOnJS(updateSeekPreview)(Math.round(seekStart.value), 0);
            seekOpacity.value = withTiming(1, show);
          } else if (startX.value < surfaceWidth.value * LEVEL_ZONE) {
            mode.value = BRIGHTNESS;
            base.value = brightness.value;
            brightnessFill.value = brightness.value;
            brightnessOpacity.value = withTiming(1, show);
          } else if (startX.value > surfaceWidth.value * (1 - LEVEL_ZONE)) {
            mode.value = VOLUME;
            base.value = volumeLevel.value;
            volumeFill.value = volumeLevel.value / VOLUME_MAX;
            volumeOpacity.value = withTiming(1, show);
          } else {
            // A vertical swipe through the middle does nothing.
            mode.value = NONE;
          }
        }

        if (mode.value === SEEK && surfaceWidth.value > 0) {
          const target = clamp(
            seekStart.value + swipeSeconds(e.translationX / surfaceWidth.value),
            0,
            durationValue.value
          );
          if (Math.round(target) !== Math.round(seekTarget.value)) {
            runOnJS(updateSeekPreview)(
              Math.round(target),
              Math.round(target - seekStart.value)
            );
          }
          seekTarget.value = target;
        } else if (mode.value === BRIGHTNESS && surfaceHeight.value > 0) {
          const next = clamp(
            base.value - e.translationY / (surfaceHeight.value * SWIPE_SPAN),
            0,
            1
          );
          brightness.value = next;
          brightnessFill.value = next;
          // Each call crosses to native; a 1% step is finer than the eye sees.
          if (Math.abs(next - lastBrightnessSent.value) >= 0.01) {
            lastBrightnessSent.value = next;
            runOnJS(applyBrightness)(next);
          }
        } else if (mode.value === VOLUME && surfaceHeight.value > 0) {
          const next = clamp(
            base.value -
              (e.translationY / (surfaceHeight.value * SWIPE_SPAN)) *
                VOLUME_MAX,
            0,
            VOLUME_MAX
          );
          if (Math.round(next) !== Math.round(volumeLevel.value)) {
            runOnJS(onVolumeChange)(Math.round(next));
          }
          volumeLevel.value = next;
          volumeFill.value = next / VOLUME_MAX;
        }
      })
      .onEnd(() => {
        if (mode.value === SEEK) runOnJS(onSeekTo)(seekTarget.value);
      })
      .onFinalize(() => {
        mode.value = NONE;
        seekOpacity.value = withTiming(0, hide);
        brightnessOpacity.value = withTiming(0, hide);
        volumeOpacity.value = withTiming(0, hide);
      });

    // Taps fail once the finger travels, which hands the touch to the pan.
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(300)
      .maxDistance(12)
      .onEnd((e, success) => {
        if (!success || surfaceWidth.value <= 0) return;
        runOnJS(handleDoubleTap)(e.x, surfaceWidth.value);
      });

    const singleTap = Gesture.Tap()
      .numberOfTaps(1)
      .maxDuration(300)
      .maxDistance(12)
      .onEnd((e, success) => {
        if (!success) return;
        runOnJS(handleSingleTap)(e.x, surfaceWidth.value);
      });

    // `Exclusive` makes the single tap wait for a possible second tap, so one
    // gesture never fires both.
    return Gesture.Race(pan, Gesture.Exclusive(doubleTap, singleTap));
  }, [
    progress,
    durationValue,
    surfaceWidth,
    surfaceHeight,
    brightness,
    volumeLevel,
    mode,
    startX,
    base,
    seekStart,
    seekTarget,
    lastBrightnessSent,
    seekOpacity,
    brightnessOpacity,
    volumeOpacity,
    brightnessFill,
    volumeFill,
    updateSeekPreview,
    applyBrightness,
    onVolumeChange,
    onVolumeTouch,
    onSeekTo,
    handleDoubleTap,
    handleSingleTap,
  ]);

  /* -------------------------------- styles -------------------------------- */

  const backStyle = useAnimatedStyle(() => ({
    opacity: backPulse.value,
    transform: [{ scale: 0.8 + backPulse.value * 0.2 }],
  }));

  const forwardStyle = useAnimatedStyle(() => ({
    opacity: forwardPulse.value,
    transform: [{ scale: 0.8 + forwardPulse.value * 0.2 }],
  }));

  const seekStyle = useAnimatedStyle(() => ({ opacity: seekOpacity.value }));

  const volumeIcon =
    volume === 0 ? "volume-off" : volume < 50 ? "volume-down" : "volume-up";
  const brightnessIcon =
    brightnessPct < 34
      ? "brightness-low"
      : brightnessPct < 67
        ? "brightness-medium"
        : "brightness-high";

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={StyleSheet.absoluteFill}
        onLayout={(e) => {
          surfaceWidth.value = e.nativeEvent.layout.width;
          surfaceHeight.value = e.nativeEvent.layout.height;
        }}
      >
        {/* Feedback layers. Decorative — the seek itself is announced by the
            scrub bar's accessibility value. */}
        <View style={styles.zones} pointerEvents="none">
          <Animated.View style={[styles.pulse, backStyle]}>
            <View style={styles.badge}>
              <MaterialIcons
                name="rotate-left"
                size={IconSize.xl}
                color={Palette.foreground}
              />
              <AppText variant="micro">
                {side === "back" ? amount : SEEK_STEP}s
              </AppText>
            </View>
          </Animated.View>

          <Animated.View style={[styles.pulse, forwardStyle]}>
            <View style={styles.badge}>
              <MaterialIcons
                name="rotate-right"
                size={IconSize.xl}
                color={Palette.foreground}
              />
              <AppText variant="micro">
                {side === "forward" ? amount : SEEK_STEP}s
              </AppText>
            </View>
          </Animated.View>
        </View>

        <Animated.View
          pointerEvents="none"
          style={[styles.seekReadout, seekStyle]}
        >
          <View style={styles.seekBadge}>
            <AppText variant="headline">
              {formatDelta(seekPreview.delta)}
            </AppText>
            <AppText variant="small" tone="muted">
              {formatTime(seekPreview.target)} / {formatTime(duration)}
            </AppText>
          </View>
        </Animated.View>

        {/* Each meter sits on the side opposite its swipe strip, so the thumb
            doing the swiping never covers it. */}
        <LevelBar
          side="right"
          icon={brightnessIcon}
          label={`${brightnessPct}%`}
          level={brightnessFill}
          opacity={brightnessOpacity}
        />
        <LevelBar
          side="left"
          icon={volumeIcon}
          label={`${volume}%`}
          level={volumeFill}
          // Above 100% the phone is at full volume and libVLC is amplifying.
          boost={100 / VOLUME_MAX}
          opacity={volumeOpacity}
        />

        {children}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  zones: { ...StyleSheet.absoluteFill, flexDirection: "row" },
  pulse: { flex: 1, alignItems: "center", justifyContent: "center" },
  badge: {
    alignItems: "center",
    gap: Spacing.xxs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  seekReadout: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  seekBadge: {
    alignItems: "center",
    gap: Spacing.xxs,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  level: {
    position: "absolute",
    top: "50%",
    marginTop: -(BAR_HEIGHT / 2 + 48),
    width: LEVEL_WIDTH,
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  // Equal-width digits, so the number itself doesn't jitter as it changes.
  levelLabel: { textAlign: "center", fontVariant: ["tabular-nums"] },
  levelLeft: { left: Spacing.xxxl },
  levelRight: { right: Spacing.xxxl },
  track: {
    width: 6,
    height: BAR_HEIGHT,
    borderRadius: Radius.pill,
    backgroundColor: "rgba(248, 250, 252, 0.2)",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  fill: { width: "100%", borderRadius: Radius.pill },
  tick: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Palette.background,
  },
});
