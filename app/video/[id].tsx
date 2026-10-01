import { DownloadButton } from "@/components/DownloadButton";
import { EPISODE_ROW_HEIGHT, EpisodeRow } from "@/components/EpisodeRow";
import { SeasonPicker } from "@/components/SeasonPicker";
import { AppText } from "@/components/ui/AppText";
import { Chip, PrimaryButton } from "@/components/ui/Buttons";
import { useMotion, useMotionEnabled } from "@/components/ui/Motion";
import { PressableScale } from "@/components/ui/PressableScale";
import { StickyHeaderBar } from "@/components/ui/ScreenHeader";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/StateViews";
import {
  Duration,
  Easings,
  Gradients,
  gutterFor,
  IconSize,
  Palette,
  Radius,
  Spacing,
} from "@/constants/theme";
import { apiService } from "@/services/api";
import { Episode, TVShow, VideoType } from "@/types";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  LinearTransition,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DESCRIPTION_LINES = 3;

/** Compact identity thumbnail — 2:3, sized to sit beside the title block. */
const POSTER_W = 104;
const POSTER_H = Math.round(POSTER_W * 1.5);

export default function VideoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height: screenHeight } = useWindowDimensions();
  const { enter } = useMotion();
  const motion = useMotionEnabled();
  const gutter = gutterFor(width);

  const [video, setVideo] = useState<VideoType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [season, setSeason] = useState(1);

  const scrollY = useSharedValue(0);

  /**
   * The artwork is the page's backdrop, not a banner.
   *
   * It previously occupied 56% of the screen before a single word appeared,
   * which pushed the synopsis and the episode list below the fold and turned a
   * short page into a long scroll. Now it fills the screen *behind* the content
   * and a compact poster carries the thumbnail role — so title, metadata,
   * actions and the first episodes all land in the first screenful.
   */
  const backdropHeight = Math.round(Math.min(screenHeight * 0.46, 420));

  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const fetchVideoDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const post = await apiService.fetchIndividualPost(id);
      const data = apiService.convertIndividualPostToVideo(post);
      setVideo(data);
      // Land on the first season the show actually has, not a hardcoded 1.
      if (data.type === "tv" && data.seasons?.length) {
        setSeason(data.seasons[0].seasonNumber);
      }
    } catch {
      setError("We couldn't load the details for this title.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchVideoDetails();
  }, [fetchVideoDetails]);

  const isSeries = video?.type === "tv";
  const seasons = useMemo(
    () => (isSeries ? ((video as TVShow).seasons ?? []) : []),
    [isSeries, video]
  );
  const episodes = useMemo(
    () => seasons.find((s) => s.seasonNumber === season)?.episodes ?? [],
    [seasons, season]
  );

  /**
   * Backdrop parallax: drifts at a third of the scroll speed and fades out as
   * the content rises over it, so the page reads as copy moving across artwork
   * rather than a header scrolling away.
   */
  const backdropStyle = useAnimatedStyle(() => {
    if (!motion) return {};
    return {
      transform: [
        {
          translateY: interpolate(
            scrollY.value,
            [-backdropHeight, 0, backdropHeight],
            [-backdropHeight / 3, 0, backdropHeight / 3],
            Extrapolation.CLAMP
          ),
        },
        {
          scale: interpolate(
            scrollY.value,
            [-backdropHeight, 0],
            [1.5, 1],
            Extrapolation.CLAMP
          ),
        },
      ],
      opacity: interpolate(
        scrollY.value,
        [0, backdropHeight * 0.6],
        [1, 0],
        Extrapolation.CLAMP
      ),
    };
  });

  const handlePlay = useCallback(() => {
    if (!video) return;
    if (video.type === "tv") {
      const first = episodes[0] ?? (video as TVShow).seasons?.[0]?.episodes?.[0];
      if (first) router.push(`/player/${first.id}`);
      return;
    }
    router.push(`/player/${video.id}`);
  }, [video, episodes, router]);

  const handleEpisodePress = useCallback(
    (episode: Episode) => router.push(`/player/${episode.id}`),
    [router]
  );

  const renderEpisode = useCallback(
    ({ item }: { item: Episode }) => (
      <EpisodeRow
        episode={item}
        onPress={handleEpisodePress}
        showId={id}
        showTitle={video?.title}
      />
    ),
    [handleEpisodePress, id, video?.title]
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <StickyHeaderBar title="" scrollY={scrollY} />
        <SkeletonGroup label="Loading title details">
          <View
            style={[
              styles.identity,
              { paddingHorizontal: gutter, paddingTop: insets.top + Spacing.xxl },
            ]}
          >
            <Skeleton width={POSTER_W} height={POSTER_H} radius={Radius.lg} />
            <View style={styles.identityText}>
              <Skeleton width="80%" height={26} />
              <Skeleton width="55%" height={14} />
              <Skeleton width="70%" height={14} />
            </View>
          </View>
          <View style={{ paddingHorizontal: gutter, gap: Spacing.sm }}>
            <Skeleton width={180} height={48} radius={Radius.pill} />
            <Skeleton width="100%" height={14} style={{ marginTop: Spacing.md }} />
            <Skeleton width="92%" height={14} />
          </View>
        </SkeletonGroup>
      </View>
    );
  }

  if (error || !video) {
    return (
      <View style={styles.container}>
        <StickyHeaderBar title="" scrollY={scrollY} />
        <View style={styles.centered}>
          <ErrorState
            title="Title unavailable"
            message={error ?? "We couldn't find this title."}
            onRetry={fetchVideoDetails}
          />
        </View>
      </View>
    );
  }

  const runtime =
    video.watchTime ||
    (isSeries
      ? `${(video as TVShow).totalEpisodes} episodes`
      : `${video.duration}m`);

  /**
   * Everything above the episode list is the list header, so the episodes
   * themselves stay virtualised — a 40-episode season renders a screenful
   * rather than all forty rows.
   */
  const header = (
    <>
      <Animated.View
        entering={enter.rise(0)}
        style={[
          styles.identity,
          { paddingHorizontal: gutter, paddingTop: insets.top + Spacing.xxl },
        ]}
      >
        {/* Compact poster. The backdrop behind the page already sets the mood,
            so this only has to identify the title. */}
        <Image
          source={{ uri: video.poster }}
          style={styles.poster}
          contentFit="cover"
          transition={Duration.base}
          cachePolicy="memory-disk"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />

        <View style={styles.identityText}>
          <AppText variant="label" tone="accent">
            {isSeries ? "Series" : "Film"}
          </AppText>
          <AppText
            variant="headline"
            accessibilityRole="header"
            numberOfLines={3}
          >
            {video.title}
          </AppText>

          <View
            style={styles.metadata}
            accessible
            accessibilityLabel={`${video.releaseYear}, rated ${video.rating.toFixed(
              1
            )} out of 10, ${runtime}${video.quality ? `, ${video.quality}` : ""}`}
          >
            <Chip label={`${video.releaseYear}`} />
            <Chip label={video.rating.toFixed(1)} icon="star" />
            <Chip
              label={runtime}
              icon="time-outline"
              iconColor={Palette.mutedForeground}
            />
            {!!video.quality && (
              <Chip
                label={video.quality}
                icon="sparkles-outline"
                iconColor={Palette.mutedForeground}
              />
            )}
          </View>

          {video.genres?.length > 0 && (
            <AppText variant="small" tone="muted" numberOfLines={2}>
              {video.genres.join("  ·  ")}
            </AppText>
          )}
        </View>
      </Animated.View>

      <View style={[styles.body, { paddingHorizontal: gutter }]}>
        <Animated.View entering={enter.rise(1)} style={styles.actions}>
          <PrimaryButton
            label={isSeries ? "Play episode 1" : "Play"}
            icon="play"
            onPress={handlePlay}
            accessibilityLabel={`Play ${video.title}`}
            style={styles.playCta}
          />

          {/*
            Only films get a download button here. A series is downloaded an
            episode at a time from the list below — there is no single file to
            fetch for a whole show.
          */}
          {!isSeries && (
            <DownloadButton
              withLabel
              request={{
                id: video.id,
                title: video.title,
                sourceUrl: video.videoUrl,
                poster: video.poster,
                backdrop: video.backdrop,
                durationMinutes: video.duration,
              }}
            />
          )}

        </Animated.View>

        {/* Progressive disclosure: a long synopsis stays collapsed by default. */}
        <Animated.View
          entering={enter.rise(2)}
          layout={
            motion
              ? LinearTransition.duration(Duration.base).easing(Easings.out)
              : undefined
          }
          style={styles.section}
        >
          <AppText
            variant="body"
            tone="muted"
            numberOfLines={expanded ? undefined : DESCRIPTION_LINES}
            style={styles.description}
          >
            {video.description}
          </AppText>

          {(video.description?.length ?? 0) > 140 && (
            <PressableScale
              onPress={() => setExpanded((e) => !e)}
              accessibilityRole="button"
              accessibilityLabel={expanded ? "Show less" : "Show more"}
              accessibilityState={{ expanded }}
              scaleTo={0.98}
              style={styles.moreToggle}
            >
              <AppText variant="micro" tone="accent">
                {expanded ? "Show less" : "Show more"}
              </AppText>
              <Ionicons
                name={expanded ? "chevron-up" : "chevron-down"}
                size={IconSize.sm}
                color={Palette.accent}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            </PressableScale>
          )}
        </Animated.View>

        {isSeries && seasons.length > 0 && (
          <Animated.View entering={enter.rise(3)} style={styles.section}>
            <AppText
              variant="title"
              accessibilityRole="header"
              style={styles.sectionTitle}
            >
              Episodes
            </AppText>
            <SeasonPicker
              seasons={seasons}
              selected={season}
              onSelect={setSeason}
            />
          </Animated.View>
        )}
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      {/* Page backdrop, behind everything and clipped to its own box. */}
      <View
        style={[styles.backdrop, { height: backdropHeight }]}
        pointerEvents="none"
      >
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Image
            source={{ uri: video.backdrop }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={Duration.slow}
            cachePolicy="memory-disk"
            // Decoration: the title block right over it carries the meaning.
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Animated.View>
        {/* Heavy scrim — text sits directly on this, so it has to win. */}
        {/* Reaches solid black by ~80% so the artwork never ghosts through
            underneath the synopsis — which is what made a film's short page look
            like a half-loaded screen. */}
        <LinearGradient
          colors={Gradients.heroScrim}
          locations={[0, 0.3, 0.62, 0.82]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <StickyHeaderBar title={video.title} scrollY={scrollY} />

      <Animated.FlatList
        data={episodes}
        renderItem={renderEpisode}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingBottom: insets.bottom + Spacing.xxl,
        }}
        // The header is full-bleed; only the episode rows take the page gutter.
        ListHeaderComponentStyle={{
          marginHorizontal: -gutter,
          marginBottom: Spacing.sm,
        }}
        getItemLayout={(_, i) => ({
          length: EPISODE_ROW_HEIGHT + Spacing.xs,
          offset: (EPISODE_ROW_HEIGHT + Spacing.xs) * i,
          index: i,
        })}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={9}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.background },
  centered: { flex: 1, justifyContent: "center" },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
  },
  identity: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingBottom: Spacing.md,
  },
  poster: {
    width: POSTER_W,
    height: POSTER_H,
    borderRadius: Radius.lg,
    backgroundColor: Palette.muted,
  },
  identityText: { flex: 1, gap: Spacing.xxs, justifyContent: "center" },
  metadata: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xxs,
    marginTop: Spacing.xxs,
  },
  body: { gap: Spacing.md },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: Spacing.sm,
  },
  playCta: { flexGrow: 1 },
  section: { marginTop: Spacing.xs },
  sectionTitle: { marginBottom: Spacing.sm },
  /** Caps the measure so paragraphs don't run edge-to-edge on a tablet. */
  description: { maxWidth: 640 },
  moreToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xxs,
    alignSelf: "flex-start",
    minHeight: 44,
    paddingRight: Spacing.sm,
  },
});
