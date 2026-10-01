import OptimizedVideoCard from "@/components/OptimizedVideoCard";
import { AppText } from "@/components/ui/AppText";
import { useMotion } from "@/components/ui/Motion";
import {
  LargeTitle,
  StickyHeaderBar,
  useStickyHeaderHeight,
} from "@/components/ui/ScreenHeader";
import { GridSkeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/StateViews";
import {
  gutterFor,
  Palette,
  POSTER_ASPECT,
  Spacing,
} from "@/constants/theme";
import { apiService } from "@/services/api";
import { VideoType } from "@/types";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PAGE_SIZE = 50;

function columnsFor(width: number) {
  if (width >= 1200) return 6;
  if (width >= 1000) return 5;
  if (width >= 800) return 4;
  if (width >= 600) return 3;
  return 2;
}

export default function CategoryContentScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { enter } = useMotion();
  const headerHeight = useStickyHeaderHeight();

  const [videos, setVideos] = useState<VideoType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  /**
   * Page lives in a ref, not state: it is only ever read inside the fetch, and
   * keeping it out of the dependency array is what stops the load effect from
   * re-firing every time a page lands.
   */
  const pageRef = useRef(1);
  const scrollY = useSharedValue(0);

  const columns = columnsFor(width);
  const gutter = gutterFor(width);

  const { cardWidth, cardHeight } = useMemo(() => {
    const available = width - gutter * 2 - Spacing.sm * (columns - 1);
    const w = Math.floor(available / columns);
    return { cardWidth: w, cardHeight: Math.round(w / POSTER_ASPECT) };
  }, [width, columns, gutter]);

  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const load = useCallback(
    async (mode: "initial" | "refresh" | "more") => {
      const fresh = mode !== "more";
      try {
        if (mode === "initial") setLoading(true);
        if (mode === "refresh") setRefreshing(true);
        if (mode === "more") setLoadingMore(true);
        setError(null);

        const page = fresh ? 1 : pageRef.current + 1;
        const data = await apiService.fetchCategoryPosts(id, page, PAGE_SIZE);
        const posts = data.posts ?? [];
        const incoming = posts.map((post) =>
          apiService.convertSearchAPIPostToVideo(post)
        );

        if (fresh) {
          setVideos(incoming);
        } else {
          setVideos((prev) => {
            const seen = new Set(prev.map((v) => v.id));
            return [...prev, ...incoming.filter((v) => !seen.has(v.id))];
          });
        }

        pageRef.current = page;
        setHasMore(
          data.pagination?.totalPages !== undefined
            ? page < data.pagination.totalPages
            : posts.length === PAGE_SIZE
        );
      } catch {
        setError("We couldn't load this collection.");
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [id]
  );

  useEffect(() => {
    pageRef.current = 1;
    load("initial");
  }, [load]);

  const handleLoadMore = useCallback(() => {
    if (!loading && !loadingMore && !refreshing && hasMore) load("more");
  }, [loading, loadingMore, refreshing, hasMore, load]);

  const openVideo = useCallback(
    (videoId: string) => router.push(`/video/${videoId}`),
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: VideoType }) => (
      <OptimizedVideoCard
        video={item}
        width={cardWidth}
        height={cardHeight}
        onPress={openVideo}
      />
    ),
    [cardWidth, cardHeight, openVideo]
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <StickyHeaderBar title={name ?? "Collection"} scrollY={scrollY} />
        <SkeletonGroup label={`Loading ${name ?? "collection"}`}>
          <View style={{ paddingTop: headerHeight + Spacing.xl }}>
            <GridSkeleton
              columns={columns}
              cardWidth={cardWidth}
              cardHeight={cardHeight}
              gutter={gutter}
              count={columns * 3}
            />
          </View>
        </SkeletonGroup>
      </View>
    );
  }

  if (error && videos.length === 0) {
    return (
      <View style={styles.container}>
        <StickyHeaderBar title={name ?? "Collection"} scrollY={scrollY} />
        <View style={styles.centered}>
          <ErrorState
            title="Couldn't load this collection"
            message={error}
            onRetry={() => load("initial")}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StickyHeaderBar title={name ?? "Collection"} scrollY={scrollY} />

      <Animated.FlatList
        key={`content-${columns}`}
        data={videos}
        renderItem={renderItem}
        numColumns={columns}
        keyExtractor={(item) => item.id}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={columns > 1 ? styles.row : undefined}
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingBottom: insets.bottom + Spacing.xxl,
        }}
        ListHeaderComponent={
          <LargeTitle
            eyebrow="Collection"
            title={name ?? "Collection"}
            subtitle={`${videos.length}${hasMore ? "+" : ""} title${
              videos.length === 1 ? "" : "s"
            }`}
            offset={headerHeight}
            style={styles.title}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="film-outline"
            title="Nothing here yet"
            message="This collection has no titles at the moment."
            actionLabel="Refresh"
            onAction={() => load("refresh")}
          />
        }
        ListFooterComponent={
          <>
            {loadingMore && (
              <View style={styles.footer}>
                <ActivityIndicator size="small" color={Palette.accent} />
                <AppText variant="small" tone="muted">
                  Loading more…
                </AppText>
              </View>
            )}
            {/* A failure while paginating shouldn't wipe what's already loaded. */}
            {error && videos.length > 0 && (
              <Animated.View entering={enter.fade(0)} style={styles.footer}>
                <AppText
                  variant="small"
                  tone="muted"
                  accessibilityLiveRegion="polite"
                >
                  {error}
                </AppText>
              </Animated.View>
            )}
          </>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load("refresh")}
            tintColor={Palette.accent}
            colors={[Palette.accent]}
            progressBackgroundColor={Palette.card}
            progressViewOffset={headerHeight}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.6}
        initialNumToRender={columns * 3}
        maxToRenderPerBatch={columns * 2}
        windowSize={9}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.background },
  centered: { flex: 1, justifyContent: "center" },
  title: { paddingHorizontal: 0 },
  row: { gap: Spacing.sm, marginBottom: Spacing.lg },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.lg,
  },
});
