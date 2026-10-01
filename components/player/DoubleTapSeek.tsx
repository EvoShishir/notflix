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
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

export const SEEK_STEP = 10;
/** Consecutive taps inside this window keep adding to the same seek. */
const CHAIN_MS = 800;

type Side = "back" | "forward";

interface DoubleTapSeekProps {
  /** Seek by a relative number of seconds. */
  onSeek: (seconds: number) => void;
  /** Single tap anywhere — used to toggle the controls. */
  onSingleTap: () => void;
  /** Rendered above the gesture layer (the controls overlay). */
  children?: React.ReactNode;
}

/**
 * Tap-to-seek surface.
 *
 * Double-tapping the left half rewinds and the right half fast-forwards, in
 * 10-second steps. Tapping again within `CHAIN_MS` accumulates — three taps is
 * 20 seconds, four is 30 — which is what makes scrubbing by tap feel fast.
 *
 * A single tap toggles the controls instead. `Gesture.Exclusive` makes the
 * single tap wait for a possible second tap, so one gesture never fires both.
 */
export function DoubleTapSeek({
  onSeek,
  onSingleTap,
  children,
}: DoubleTapSeekProps) {
  const motion = useMotionEnabled();

  const [side, setSide] = useState<Side | null>(null);
  const [amount, setAmount] = useState(0);

  const chainRef = useRef<{
    side: Side | null;
    amount: number;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ side: null, amount: 0, timer: null });

  const backPulse = useSharedValue(0);
  const forwardPulse = useSharedValue(0);
  // The tap worklet runs on the UI thread and needs the surface width to decide
  // which half was hit, so it lives in a shared value rather than React state.
  const surfaceWidth = useSharedValue(0);

  useEffect(() => {
    // Capture the ref object once; reading `.current` inside the cleanup would
    // read whatever it holds at unmount, which is not necessarily this chain.
    const chain = chainRef.current;
    return () => {
      if (chain.timer) clearTimeout(chain.timer);
    };
  }, []);

  const handleSeek = useCallback(
    (which: Side) => {
      const chain = chainRef.current;
      if (chain.timer) clearTimeout(chain.timer);

      // Switching sides mid-chain restarts the count rather than subtracting
      // from the previous direction's total.
      const next = chain.side === which ? chain.amount + SEEK_STEP : SEEK_STEP;
      chain.side = which;
      chain.amount = next;

      setSide(which);
      setAmount(next);
      onSeek(which === "forward" ? SEEK_STEP : -SEEK_STEP);

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
    [onSeek, motion, backPulse, forwardPulse]
  );

  /**
   * Built once rather than on every render.
   *
   * Gesture objects are not cheap to reconstruct, and rebuilding them mid-touch
   * can drop the gesture. Memoising is what react-native-gesture-handler
   * recommends, and it also keeps the worklet bodies out of the render path.
   *
   * `Gesture.Exclusive` makes the single tap wait for a possible second tap, so
   * one gesture never fires both handlers.
   */
  const gesture = useMemo(() => {
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(300)
      .onEnd((e, success) => {
        if (!success || surfaceWidth.value <= 0) return;
        // Left half rewinds, right half advances.
        runOnJS(handleSeek)(e.x < surfaceWidth.value / 2 ? "back" : "forward");
      });

    const singleTap = Gesture.Tap()
      .numberOfTaps(1)
      .maxDuration(300)
      .onEnd((_e, success) => {
        if (success) runOnJS(onSingleTap)();
      });

    return Gesture.Exclusive(doubleTap, singleTap);
  }, [handleSeek, onSingleTap, surfaceWidth]);

  const backStyle = useAnimatedStyle(() => ({
    opacity: backPulse.value,
    transform: [{ scale: 0.8 + backPulse.value * 0.2 }],
  }));

  const forwardStyle = useAnimatedStyle(() => ({
    opacity: forwardPulse.value,
    transform: [{ scale: 0.8 + forwardPulse.value * 0.2 }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={StyleSheet.absoluteFill}
        onLayout={(e) => {
          surfaceWidth.value = e.nativeEvent.layout.width;
        }}
      >
        {/* Seek feedback. Purely decorative — the seek itself is announced by
            the scrub bar's accessibility value. */}
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
});
