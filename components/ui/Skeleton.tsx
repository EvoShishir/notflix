/**
 * Shimmering skeleton placeholders.
 *
 * These reserve the exact footprint of the content they stand in for, so nothing
 * jumps when real data lands. The whole skeleton tree is a single accessibility
 * node announced as busy, rather than dozens of empty views.
 */

import {
  Easings,
  Gradients,
  Palette,
  Radius,
  Spacing,
} from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect } from "react";
import {
  DimensionValue,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useMotionEnabled } from "./Motion";

const SHIMMER_WIDTH = 220;

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({
  width = "100%",
  height = 16,
  radius = Radius.sm,
  style,
}: SkeletonProps) {
  const motion = useMotionEnabled();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!motion) return;
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easings.inOut }),
      -1,
      false
    );
  }, [motion, progress]);

  const sweep = useAnimatedStyle(() => ({
    transform: [
      { translateX: -SHIMMER_WIDTH + progress.value * (SHIMMER_WIDTH * 3) },
    ],
  }));

  return (
    <View
      style={[
        { width, height, borderRadius: radius, backgroundColor: Palette.muted },
        styles.clip,
        style,
      ]}
    >
      {motion && (
        <Animated.View style={[styles.sweep, sweep]}>
          <LinearGradient
            colors={Gradients.shimmer}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}

/** Wraps a skeleton tree so screen readers announce one "Loading" node. */
export function SkeletonGroup({
  label = "Loading content",
  children,
  style,
}: {
  label?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={style}
      importantForAccessibility="yes"
    >
      {children}
    </View>
  );
}

/** A poster card placeholder matching OptimizedVideoCard's footprint. */
export function PosterSkeleton({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  return (
    <View style={{ width, marginRight: Spacing.sm }}>
      <Skeleton width={width} height={height} radius={Radius.lg} />
      <Skeleton
        width={width * 0.75}
        height={12}
        style={{ marginTop: Spacing.xs }}
      />
      <Skeleton
        width={width * 0.45}
        height={10}
        style={{ marginTop: Spacing.xxs }}
      />
    </View>
  );
}

/** A horizontal shelf placeholder: title + a run of posters. */
export function CategoryRowSkeleton({
  cardWidth = 132,
  cardHeight = 198,
  count = 4,
}: {
  cardWidth?: number;
  cardHeight?: number;
  count?: number;
}) {
  return (
    <View style={styles.row}>
      <Skeleton width={160} height={18} style={{ marginLeft: Spacing.md }} />
      <View style={styles.rowCards}>
        {Array.from({ length: count }).map((_, i) => (
          <PosterSkeleton key={i} width={cardWidth} height={cardHeight} />
        ))}
      </View>
    </View>
  );
}

/** Full-bleed hero placeholder. */
export function HeroSkeleton({ height }: { height: number }) {
  return (
    <View style={{ height, justifyContent: "flex-end" }}>
      <Skeleton width="100%" height={height} radius={0} style={styles.heroBg} />
      <View style={styles.heroContent}>
        <Skeleton width="70%" height={30} radius={Radius.sm} />
        <Skeleton
          width="90%"
          height={13}
          style={{ marginTop: Spacing.sm }}
        />
        <Skeleton width="55%" height={13} style={{ marginTop: Spacing.xxs }} />
        <View style={styles.heroButtons}>
          <Skeleton width={132} height={46} radius={Radius.pill} />
          <Skeleton width={132} height={46} radius={Radius.pill} />
        </View>
      </View>
    </View>
  );
}

/** A grid of poster placeholders for search / category results. */
export function GridSkeleton({
  columns,
  cardWidth,
  cardHeight,
  count = 8,
  gutter = Spacing.md,
}: {
  columns: number;
  cardWidth: number;
  cardHeight: number;
  count?: number;
  gutter?: number;
}) {
  return (
    <View style={[styles.grid, { paddingHorizontal: gutter }]}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            width: cardWidth,
            marginBottom: Spacing.lg,
            marginRight: (i + 1) % columns === 0 ? 0 : Spacing.sm,
          }}
        >
          <Skeleton width={cardWidth} height={cardHeight} radius={Radius.lg} />
          <Skeleton
            width={cardWidth * 0.8}
            height={12}
            style={{ marginTop: Spacing.xs }}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
  sweep: {
    ...StyleSheet.absoluteFill,
    width: SHIMMER_WIDTH,
  },
  row: { marginBottom: Spacing.lg },
  rowCards: {
    flexDirection: "row",
    marginTop: Spacing.sm,
    paddingLeft: Spacing.md,
  },
  heroBg: { ...StyleSheet.absoluteFill },
  heroContent: { padding: Spacing.md, paddingBottom: Spacing.xl },
  heroButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
});
