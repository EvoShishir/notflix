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
import { VideoType } from "@/types";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  useWindowDimensions,
  View,
  ViewToken,
} from "react-native";
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "./ui/AppText";
import { GhostButton, IconButton, PrimaryButton } from "./ui/Buttons";
import { useMotionEnabled } from "./ui/Motion";

const AUTOPLAY_MS = 6000;

/** Module-level: closes over nothing, and must never change identity. */
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 60 };

/**
 * Parallax geometry.
 *
 * The backdrop drifts by `PARALLAX_SHIFT` of the slide width in each direction,
 * so it must be pre-scaled by at least 1 + 2 x that much or the drift pulls the
 * image edge into view. `COVER_SCALE` carries a little extra margin on top.
 *
 * The scale is constant, not interpolated: animating it as well made the artwork
 * visibly breathe on every swipe.
 */
const PARALLAX_SHIFT = 0.18;
const COVER_SCALE = 1 + 2 * PARALLAX_SHIFT + 0.04;

/**
 * Hero height: tall on big phones, floored on small ones, capped in landscape.
 * Exported so the loading skeleton reserves exactly this much space and the
 * layout doesn't jump when the real carousel replaces it.
 */
export function useHeroHeight() {
  const { height } = useWindowDimensions();
  return Math.round(Math.min(Math.max(height * 0.62, 380), height - 120));
}

interface FeaturedCarouselProps {
  videos: VideoType[];
  onPlayPress: (video: VideoType) => void;
  onInfoPress: (video: VideoType) => void;
}

/* -------------------------------------------------------------------------- */

/**
 * One hero slide.
 *
 * The backdrop drifts at roughly a third of the scroll speed while the text
 * block moves at full speed, which reads as depth. Both are derived from the
 * same scroll offset, so there's no second animation to fall out of sync.
 */
function Slide({
  video,
  index,
  scrollX,
  width,
  height,
  parallax,
  onPlayPress,
  onInfoPress,
}: {
  video: VideoType;
  index: number;
  scrollX: SharedValue<number>;
  width: number;
  height: number;
  parallax: boolean;
  onPlayPress: (video: VideoType) => void;
  onInfoPress: (video: VideoType) => void;
}) {
  const insets = useSafeAreaInsets();
  const range = [(index - 1) * width, index * width, (index + 1) * width];

  const backdropStyle = useAnimatedStyle(() => {
    if (!parallax) return {};
    return {
      transform: [
        {
          translateX: interpolate(
            scrollX.value,
            range,
            [-width * PARALLAX_SHIFT, 0, width * PARALLAX_SHIFT],
            Extrapolation.CLAMP
          ),
        },
        { scale: COVER_SCALE },
      ],
    };
  });

  const contentStyle = useAnimatedStyle(() => {
    if (!parallax) return {};
    return {
      opacity: interpolate(
        scrollX.value,
        range,
        [0, 1, 0],
        Extrapolation.CLAMP
      ),
      transform: [
        {
          translateY: interpolate(
            scrollX.value,
            range,
            [28, 0, 28],
            Extrapolation.CLAMP
          ),
        },
      ],
    };
  });

  const meta =
    video.type === "movie"
      ? video.watchTime || `${video.duration}m`
      : `${video.totalEpisodes} episodes`;

  return (
    // `overflow: hidden` is what makes the swipe seamless: without it the
    // scaled, drifting backdrop spills past the slide and overlaps the artwork
    // of the neighbouring slide mid-gesture.
    <View style={{ width, height, overflow: "hidden" }}>
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <Image
          source={{ uri: video.backdrop }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={Duration.slow}
          cachePolicy="memory-disk"
          recyclingKey={video.id}
        />
      </Animated.View>

      <LinearGradient colors={Gradients.heroScrim} style={styles.scrim} />

      <Animated.View
        style={[
          styles.content,
          { paddingTop: insets.top + Spacing.xxl },
          contentStyle,
        ]}
      >
        <AppText variant="label" tone="accent">
          {video.type === "tv" ? "Series" : "Film"}
        </AppText>

        <AppText variant="hero" numberOfLines={2} style={styles.title}>
          {video.title}
        </AppText>

        {/* One accessibility node so the metadata reads as a sentence. */}
        <View
          style={styles.metadata}
          accessible
          accessibilityLabel={`${video.releaseYear}, rated ${video.rating.toFixed(
            1
          )} out of 10, ${meta}`}
        >
          <AppText variant="small" tone="muted">
            {video.releaseYear}
          </AppText>
          <View style={styles.dot} />
          <View style={styles.rating}>
            <Ionicons
              name="star"
              size={IconSize.sm - 3}
              color={Palette.star}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <AppText variant="small" style={{ color: Palette.star }}>
              {video.rating.toFixed(1)}
            </AppText>
          </View>
          <View style={styles.dot} />
          <AppText variant="small" tone="muted">
            {meta}
          </AppText>
        </View>

        {video.genres?.length > 0 && (
          <AppText variant="small" tone="muted" numberOfLines={1}>
            {video.genres.join("  ·  ")}
          </AppText>
        )}

        <View style={styles.buttons}>
          <PrimaryButton
            label="Play"
            icon="play"
            onPress={() => onPlayPress(video)}
            accessibilityLabel={`Play ${video.title}`}
          />
          <GhostButton
            label="More info"
            icon="information-circle-outline"
            onPress={() => onInfoPress(video)}
            accessibilityLabel={`More information about ${video.title}`}
          />
        </View>
      </Animated.View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

/** Pagination pill. The active one stretches and fills as autoplay progresses. */
function Pill({
  active,
  progress,
  animate,
}: {
  active: boolean;
  progress: SharedValue<number>;
  animate: boolean;
}) {
  const shellStyle = useAnimatedStyle(() => ({
    width: withTiming(active ? 26 : 7, {
      duration: Duration.base,
      easing: Easings.out,
    }),
    backgroundColor: withTiming(
      active ? Palette.borderStrong : Palette.border,
      { duration: Duration.base }
    ),
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: active && animate ? `${progress.value * 100}%` : active ? "100%" : "0%",
  }));

  return (
    <Animated.View style={[styles.pill, shellStyle]}>
      <Animated.View style={[styles.pillFill, fillStyle]} />
    </Animated.View>
  );
}

/* -------------------------------------------------------------------------- */

export default function FeaturedCarousel({
  videos,
  onPlayPress,
  onInfoPress,
}: FeaturedCarouselProps) {
  const { width } = useWindowDimensions();
  const motion = useMotionEnabled();
  const listRef = useRef<Animated.FlatList<VideoType>>(null);

  const [index, setIndex] = useState(0);
  /**
   * Auto-advance is opt-out, and Reduce Motion opts out for you. WCAG requires a
   * way to stop anything that moves on its own for more than five seconds, hence
   * the visible pause control rather than relying on scroll-to-interrupt alone.
   */
  const [playing, setPlaying] = useState(true);

  const scrollX = useSharedValue(0);
  const progress = useSharedValue(0);

  const autoplayOn = motion && playing && videos.length > 1;

  const height = useHeroHeight();

  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  /**
   * FlatList refuses a `onViewableItemsChanged` or `viewabilityConfig` whose
   * identity changes between renders, so both have to be stable. `useCallback`
   * with no dependencies gives that without reading a ref during render —
   * `setIndex` is itself stable, so there is nothing to depend on.
   */
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (first?.index != null) setIndex(first.index);
    },
    []
  );

  // Drive the pill fill, then advance when it completes.
  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;

    if (!autoplayOn) return;

    progress.value = withTiming(1, {
      duration: AUTOPLAY_MS,
      easing: Easings.linear,
    });

    const timer = setTimeout(() => {
      const next = (index + 1) % videos.length;
      listRef.current?.scrollToIndex({ index: next, animated: true });
    }, AUTOPLAY_MS);

    return () => clearTimeout(timer);
  }, [autoplayOn, index, videos.length, progress]);

  const renderItem = useCallback(
    ({ item, index: i }: { item: VideoType; index: number }) => (
      <Slide
        video={item}
        index={i}
        scrollX={scrollX}
        width={width}
        height={height}
        parallax={motion}
        onPlayPress={onPlayPress}
        onInfoPress={onInfoPress}
      />
    ),
    [scrollX, width, height, motion, onPlayPress, onInfoPress]
  );

  if (videos.length === 0) return null;

  return (
    <View style={{ height }}>
      <Animated.FlatList
        ref={listRef}
        data={videos}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY_CONFIG}
        // Taking manual control stops the carousel advancing under the user.
        onScrollBeginDrag={() => setPlaying(false)}
        getItemLayout={(_, i) => ({
          length: width,
          offset: width * i,
          index: i,
        })}
        decelerationRate="fast"
        // Horizontal swipes belong to the carousel; the page still scrolls
        // vertically and the OS back-swipe is untouched.
        directionalLockEnabled
        // The featured set is small, so keep every slide mounted. Recycling them
        // makes each backdrop re-run its fade-in as you swipe back and forth.
        removeClippedSubviews={false}
        initialNumToRender={videos.length}
        windowSize={Math.max(3, videos.length)}
      />

      {videos.length > 1 && (
        <View style={styles.controls} pointerEvents="box-none">
          <View
            style={styles.pills}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`Featured item ${index + 1} of ${videos.length}`}
          >
            {videos.map((video, i) => (
              <Pill
                key={video.id}
                active={i === index}
                progress={progress}
                animate={autoplayOn}
              />
            ))}
          </View>

          {motion && (
            <IconButton
              name={playing ? "pause" : "play"}
              label={
                playing
                  ? "Pause automatic slideshow"
                  : "Resume automatic slideshow"
              }
              size={IconSize.sm}
              onPress={() => setPlaying((p) => !p)}
              style={styles.playPause}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, justifyContent: "flex-end" },
  content: {
    ...StyleSheet.absoluteFill,
    justifyContent: "flex-end",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl + Spacing.xs,
    gap: Spacing.xs,
  },
  title: { marginTop: Spacing.xxs },
  metadata: { flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  dot: {
    width: 3,
    height: 3,
    borderRadius: Radius.pill,
    backgroundColor: Palette.subtleForeground,
  },
  rating: { flexDirection: "row", alignItems: "center", gap: Spacing.xxs },
  buttons: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    flexWrap: "wrap",
  },
  controls: {
    position: "absolute",
    bottom: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  pills: { flexDirection: "row", alignItems: "center", gap: Spacing.xxs + 2 },
  pill: {
    height: 7,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  pillFill: { height: "100%", backgroundColor: Palette.accent },
  playPause: {
    width: TouchTarget,
    height: TouchTarget,
  },
});
