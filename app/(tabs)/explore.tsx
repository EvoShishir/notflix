import OptimizedVideoCard from "@/components/OptimizedVideoCard";
import { AppText } from "@/components/ui/AppText";
import { IconButton } from "@/components/ui/Buttons";
import { useMotion } from "@/components/ui/Motion";
import { GridSkeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/StateViews";
import {
  Duration,
  Easings,
  gutterFor,
  IconSize,
  Palette,
  POSTER_ASPECT,
  Radius,
  Spacing,
  Springs,
  TouchTarget,
} from "@/constants/theme";
import { useTabBarClearance } from "@/hooks/useTabBarClearance";
import { apiService } from "@/services/api";
import { VideoType } from "@/types";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PAGE_SIZE = 50;
const DEBOUNCE_MS = 500;

/** Column count by width — more columns as the viewport grows. */
function columnsFor(width: number) {
  if (width >= 1200) return 6;
  if (width >= 1000) return 5;
  if (width >= 800) return 4;
  if (width >= 600) return 3;
  return 2;
}

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { enter } = useMotion();
  const { clearance } = useTabBarClearance();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VideoType[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // `number` is what React Native's setTimeout returns — not NodeJS.Timeout.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focus = useSharedValue(0);

  const columns = columnsFor(width);
  const gutter = gutterFor(width);

  /** Card size derived from the grid so rows never wrap unevenly. */
  const { cardWidth, cardHeight } = useMemo(() => {
    const available = width - gutter * 2 - Spacing.sm * (columns - 1);
    const w = Math.floor(available / columns);
    return { cardWidth: w, cardHeight: Math.round(w / POSTER_ASPECT) };
  }, [width, columns, gutter]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const performSearch = useCallback(
    async (text: string, loadMore = false) => {
      if (!text.trim()) {
        setResults([]);
        setHasSearched(false);
        setPage(1);
        setHasMore(true);
        setError(null);
        return;
      }

      try {
        if (loadMore) {
          setLoadingMore(true);
        } else {
          setLoading(true);
          setPage(1);
          setResults([]);
          setHasMore(true);
        }
        setError(null);

        const nextPage = loadMore ? page + 1 : 1;
        const data = await apiService.searchPosts(text, nextPage, PAGE_SIZE);
        const videos = data.posts.map((post) =>
          apiService.convertSearchAPIPostToVideo(post)
        );

        if (loadMore) {
          setResults((prev) => {
            const seen = new Set(prev.map((v) => v.id));
            return [...prev, ...videos.filter((v) => !seen.has(v.id))];
          });
          setPage(nextPage);
        } else {
          setResults(videos);
          setHasSearched(true);
        }

        setHasMore(
          data.pagination?.totalPages !== undefined
            ? nextPage < data.pagination.totalPages
            : videos.length === PAGE_SIZE
        );
      } catch {
        setError("We couldn't reach the search service.");
        if (!loadMore) setResults([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [page]
  );

  const handleChange = useCallback(
    (text: string) => {
      setQuery(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(
        () => performSearch(text),
        DEBOUNCE_MS
      );
    },
    [performSearch]
  );

  const handleClear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery("");
    performSearch("");
  }, [performSearch]);

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && !loading && hasMore && query.trim()) {
      performSearch(query, true);
    }
  }, [loadingMore, loading, hasMore, query, performSearch]);

  // One stable callback for the whole grid — see OptimizedVideoCard's `onPress`.
  const openVideo = useCallback(
    (videoId: string) => router.push(`/video/${videoId}`),
    [router]
  );

  // No wrapper View and no per-cell margin: `columnWrapperStyle` gap handles the
  // spacing, which removes a view per cell and a style object per render.
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

  /** The search field lifts and picks up an accent ring while focused. */
  const fieldStyle = useAnimatedStyle(() => ({
    borderColor: withTiming(
      focus.value ? Palette.accent : Palette.border,
      { duration: Duration.fast, easing: Easings.out }
    ),
    transform: [{ scale: withSpring(1 + focus.value * 0.012, Springs.press) }],
  }));

  const showGrid = !loading && !error;

  return (
    <View style={styles.container}>
      <Animated.View
        entering={enter.drop(0)}
        style={[
          styles.searchWrap,
          { paddingTop: insets.top + Spacing.xs, paddingHorizontal: gutter },
        ]}
      >
        {/* Visible label, not a placeholder standing in for one. */}
        <AppText variant="label" tone="muted" style={styles.label} nativeID="search-label">
          Search
        </AppText>

        <Animated.View style={[styles.field, fieldStyle]}>
          <Ionicons
            name="search"
            size={IconSize.md}
            color={Palette.mutedForeground}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <TextInput
            style={styles.input}
            placeholder="Titles, genres, years…"
            placeholderTextColor={Palette.subtleForeground}
            value={query}
            onChangeText={handleChange}
            onFocus={() => (focus.value = 1)}
            onBlur={() => (focus.value = 0)}
            returnKeyType="search"
            onSubmitEditing={() => {
              Keyboard.dismiss();
              performSearch(query);
            }}
            autoCorrect={false}
            accessibilityLabel="Search movies and TV shows"
            accessibilityLabelledBy="search-label"
            maxFontSizeMultiplier={1.4}
            selectionColor={Palette.accent}
          />
          {query.length > 0 && (
            <Animated.View entering={enter.pop(0)}>
              <IconButton
                name="close-circle"
                label="Clear search"
                size={IconSize.md}
                tone="plain"
                onPress={handleClear}
                style={styles.clear}
              />
            </Animated.View>
          )}
        </Animated.View>
      </Animated.View>

      {loading && (
        <SkeletonGroup label={`Searching for ${query}`}>
          <GridSkeleton
            columns={columns}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            gutter={gutter}
            count={columns * 3}
          />
        </SkeletonGroup>
      )}

      {error && (
        <ErrorState
          title="Search is unavailable"
          message={error}
          onRetry={() => performSearch(query)}
        />
      )}

      {showGrid && (
        <Animated.FlatList
          // Remounting on column change is required for numColumns.
          key={`grid-${columns}`}
          data={results}
          renderItem={renderItem}
          numColumns={columns}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.listContent,
            { paddingHorizontal: gutter, paddingBottom: clearance },
          ]}
          columnWrapperStyle={columns > 1 ? styles.row : undefined}
          ListHeaderComponent={
            hasSearched && query.trim() ? (
              <AppText
                variant="small"
                tone="muted"
                style={styles.resultCount}
                // Announced when the count changes, so screen reader users
                // learn the search returned without re-reading the list.
                accessibilityLiveRegion="polite"
              >
                {results.length} result{results.length === 1 ? "" : "s"} for “
                {query.trim()}”
              </AppText>
            ) : null
          }
          ListEmptyComponent={
            hasSearched && query.trim() ? (
              <EmptyState
                icon="search-outline"
                title="No matches"
                message={`Nothing came back for “${query.trim()}”. Try a shorter or differently spelled title.`}
              />
            ) : (
              <EmptyState
                icon="sparkles-outline"
                title="Find something to watch"
                message="Search by title, genre or year — results appear as you type."
              />
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator size="small" color={Palette.accent} />
                <AppText variant="small" tone="muted">
                  Loading more…
                </AppText>
              </View>
            ) : null
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.6}
          initialNumToRender={columns * 3}
          maxToRenderPerBatch={columns * 2}
          windowSize={9}
          removeClippedSubviews
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.background },
  searchWrap: { paddingBottom: Spacing.sm },
  label: { marginBottom: Spacing.xs },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    minHeight: TouchTarget + 4,
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.xxs,
    borderRadius: Radius.lg,
    backgroundColor: Palette.card,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  input: {
    flex: 1,
    color: Palette.foreground,
    fontSize: 16,
    paddingVertical: Spacing.sm,
  },
  clear: { width: TouchTarget, height: TouchTarget },
  listContent: { paddingTop: Spacing.xs },
  row: { gap: Spacing.sm, marginBottom: Spacing.lg },
  resultCount: { marginBottom: Spacing.md },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.lg,
  },
});
