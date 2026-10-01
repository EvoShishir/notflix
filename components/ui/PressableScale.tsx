/**
 * A Pressable that springs down on touch.
 *
 * The press feedback is a transform, so it never changes layout bounds and can't
 * push neighbouring content around. It lands well inside the 80-150ms window for
 * perceived responsiveness, and collapses to a plain opacity change when the user
 * has asked for reduced motion.
 */

import { HitSlop, Palette, PressScale, Springs } from "@/constants/theme";
import React, { forwardRef } from "react";
import {
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useMotionEnabled } from "./Motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  /** How far to scale down while held. Defaults to the shared token. */
  scaleTo?: number;
  /** Set false to skip the Android ripple (e.g. for full-bleed artwork). */
  ripple?: boolean;
  children?: React.ReactNode;
}

export const PressableScale = forwardRef<
  React.ComponentRef<typeof Pressable>,
  PressableScaleProps
>(function PressableScale(
  {
    style,
    scaleTo = PressScale,
    ripple = true,
    onPressIn,
    onPressOut,
    disabled,
    children,
    ...rest
  },
  ref
) {
  const motion = useMotionEnabled();
  const pressed = useSharedValue(0);

  /**
   * The spring runs on the shared value, not inside the style worklet.
   *
   * Calling `withSpring` inside `useAnimatedStyle` builds a fresh animation
   * object every time the style is evaluated — once per frame, per mounted
   * card. Driving `pressed` directly means the worklet is pure arithmetic.
   */
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }],
    opacity: 1 - pressed.value * 0.14,
  }));

  return (
    <AnimatedPressable
      ref={ref}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={HitSlop}
      android_ripple={
        ripple && Platform.OS === "android"
          ? { color: Palette.ripple, foreground: true }
          : undefined
      }
      onPressIn={(e) => {
        pressed.value = motion ? withSpring(1, Springs.press) : 0;
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = motion ? withSpring(0, Springs.press) : 0;
        onPressOut?.(e);
      }}
      style={[style, animatedStyle, disabled && { opacity: 0.4 }]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
});
