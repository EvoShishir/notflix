import { useData } from "@/contexts/DataContext";
import { Category } from "@/types";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Platform, RefreshControl, StyleSheet, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Gradients,
  IconSize,
  Palette,
  Spacing,
  TouchTarget,
} from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import { useTabBarClearance } from "@/hooks/useTabBarClearance";
import { ContinueWatchingRow } from "./ContinueWatchingRow";
import FeaturedCarousel, { useHeroHeight } from "./FeaturedCarousel";
import OptimizedCategoryRow, { useCardSize } from "./OptimizedCategoryRow";
import { AppText } from "./ui/AppText";
import { IconButton } from "./ui/Buttons";
import { useMotion } from "./ui/Motion";
import {
  CategoryRowSkeleton,
  HeroSkeleton,
  SkeletonGroup,
} from "./ui/Skeleton";
import { ErrorState } from "./ui/StateViews";

interface HomePageProps {
  onVideoPress: (videoId: string) => void;
  onPlayVideo: (videoId: string) => void;
}

/**
 * Brand bar.
 *
 * It floats transparently over the hero artwork and only acquires a blurred
 * surface once you've scrolled past it — the wordmark stays readable throughout
 * because of the permanent top scrim behind it.
 */
function BrandHeader({
  scrollY,
  onSearch,
}: {
  scrollY: SharedValue<number>;
  onSearch: () => void;
}) {
  const insets = useSafeAreaInsets();

  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [60, 200],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  return (
    <View
      style={[styles.brandBar, { paddingTop: insets.top }]}
      pointerEvents="box-none"
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, surfaceStyle]}
        pointerEvents="none"
      >
        {Platform.OS === "ios" ? (
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={styles.androidSurface} />
        )}
      </Animated.View>

      <LinearGradient
        colors={Gradients.topScrim}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.brandRow}>
        {/*
          The logo is the app's identity, not decoration, so it carries a text
          alternative and the header role the wordmark used to provide.
        */}
        <Image
          // A 300x100 copy of logo-wordmark.png, which is 2172px and ~950 KB —
          // far more than a 24pt header needs. The full-size original stays in
          // the repo as the source to regenerate from.
          source={require("@/assets/images/wordmark.png")}
          style={styles.logo}
          contentFit="contain"
          accessibilityRole="header"
          accessibilityLabel="NotFlix"
        />

        <IconButton
          name="search"
          label="Search movies and shows"
          size={IconSize.md}
          tone="plain"
          onPress={onSearch}
        />
      </View>
    </View>
  );
}

export default function HomePage({ onVideoPress, onPlayVideo }: HomePageProps) {
  const { categories, loading, error, refetch } = useData();
  const router = useRouter();
  const scrollY = useSharedValue(0);
  const { enter } = useMotion();
  const { cardWidth, cardHeight } = useCardSize();
  const heroHeight = useHeroHeight();
  const insets = useSafeAreaInsets();
  const { clearance } = useTabBarClearance();

  /**
   * Refreshing is tracked separately from the context's `loading`, which also
   * flips during a refetch. Without this, pulling to refresh would swap the whole
   * feed back to skeletons and throw away the user's scroll position.
   */
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const featured = useMemo(
    () => categories.find((c) => c.id === "recently-added")?.videos ?? [],
    [categories]
  );

  const shelves = useMemo(
    () =>
      categories
        .filter((c) => c.id !== "trending" && c.id !== "recently-added")
        .slice(0, 10),
    [categories]
  );

  const goToSearch = useCallback(() => router.push("/explore"), [router]);

  const renderCategoryItem = useCallback(
    ({ item, index }: { item: Category; index: number }) => (
      <OptimizedCategoryRow
        category={item}
        index={index}
        onVideoPress={onVideoPress}
        onSeeAllPress={() =>
          router.push({
            pathname: "/category-content/[id]",
            params: { id: item.id, name: item.name },
          })
        }
      />
    ),
    [onVideoPress, router]
  );

  /**
   * Hero plus the resume shelf.
   *
   * Continue watching sits directly under the hero and above every category,
   * because picking up an unfinished episode is the most likely reason to open
   * the app. It renders nothing when there is nothing part-watched, so a new
   * install doesn't get an empty heading.
   */
  const renderHeader = useCallback(
    () => (
      <>
        {featured.length > 0 && (
          <FeaturedCarousel
            videos={featured}
            onPlayPress={(v) => onPlayVideo(v.id)}
            onInfoPress={(v) => onVideoPress(v.id)}
          />
        )}
        <View style={styles.resumeShelf}>
          <ContinueWatchingRow onResume={onPlayVideo} />
        </View>
      </>
    ),
    [featured, onPlayVideo, onVideoPress]
  );

  // Only the very first load takes over the screen; a refresh keeps the feed.
  if (loading && categories.length === 0) {
    return (
      <View style={styles.container}>
        <SkeletonGroup label="Loading your home feed">
          <HeroSkeleton height={heroHeight} />
          <View style={{ marginTop: Spacing.lg }}>
            <CategoryRowSkeleton
              cardWidth={cardWidth}
              cardHeight={cardHeight}
            />
            <CategoryRowSkeleton
              cardWidth={cardWidth}
              cardHeight={cardHeight}
            />
          </View>
        </SkeletonGroup>
      </View>
    );
  }

  if (error && categories.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ErrorState
          title="We couldn't load your feed"
          message={error}
          onRetry={refetch}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.FlatList
        data={shelves}
        renderItem={renderCategoryItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={<View style={{ height: clearance }} />}
        ListEmptyComponent={
          <Animated.View entering={enter.rise(0)} style={styles.empty}>
            <AppText variant="headline">Nothing to watch yet</AppText>
            <AppText variant="body" tone="muted" style={styles.emptyText}>
              Pull down to refresh and check again.
            </AppText>
          </Animated.View>
        }
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Palette.accent}
            colors={[Palette.accent]}
            progressBackgroundColor={Palette.card}
            // Push the spinner below the floating brand bar.
            progressViewOffset={insets.top + TouchTarget}
          />
        }
        // Each row is a whole horizontal list of posters, so mounting one is
        // expensive. Small batches spread that cost across frames instead of
        // stalling the scroll to build three shelves at once.
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        updateCellsBatchingPeriod={80}
        windowSize={5}
        removeClippedSubviews
      />

      <BrandHeader scrollY={scrollY} onSearch={goToSearch} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.background },
  centered: { justifyContent: "center" },
  // Breathing room between the hero artwork and the first shelf.
  resumeShelf: { marginTop: Spacing.lg },
  brandBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  androidSurface: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Palette.glass,
  },
  brandRow: {
    height: TouchTarget + Spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: Spacing.md,
    paddingRight: Spacing.xs,
  },
  // 3:1 wordmark, so width follows the aspect rather than being square.
  logo: { width: 72, height: 24 },
  empty: { paddingVertical: Spacing.xxl, paddingHorizontal: Spacing.xl, alignItems: "center" },
  emptyText: { marginTop: Spacing.xs, textAlign: "center" },
});
