import {
  Duration,
  Gradients,
  IconSize,
  Palette,
  Radius,
  Spacing,
} from "@/constants/theme";
import { getFraction, useWatchProgress } from "@/lib/watchProgress";
import { VideoType } from "@/types";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "./ui/AppText";
import { PressableScale } from "./ui/PressableScale";
import { ProgressBar } from "./ui/ProgressBar";

interface VideoCardProps {
  video: VideoType;
  /**
   * Receives the video id, so the parent can pass one stable callback for the
   * whole list instead of minting a new arrow function per cell — the latter
   * changes identity every render and defeats the `memo` below.
   */
  onPress: (videoId: string) => void;
  width?: number;
  height?: number;
}

/**
 * Poster card.
 *
 * Deliberately has no mount animation. Windowed lists mount and unmount cells
 * constantly while scrolling, so a per-card entrance re-runs on every recycle —
 * that was a real source of scroll jank, and the cross-fade `expo-image` already
 * does when a bitmap decodes reads better anyway: it is GPU-side and tracks the
 * actual image load rather than the mount.
 *
 * The whole card is one accessibility node: a screen reader reads the title,
 * year and rating as a single sentence instead of four disconnected labels.
 */
const OptimizedVideoCard = memo(function VideoCard({
  video,
  onPress,
  width = 132,
  height = 198,
}: VideoCardProps) {
  const handlePress = useCallback(() => onPress(video.id), [onPress, video.id]);

  // Subscribes to this title only, so a position update while watching one
  // video doesn't re-render every other card on screen.
  const watched = getFraction(useWatchProgress(video.id));

  const rating = video.rating.toFixed(1);
  const a11yLabel = [
    video.title,
    video.releaseYear ? `${video.releaseYear}` : null,
    `rated ${rating} out of 10`,
    video.type === "tv" ? "TV series" : "Movie",
    watched > 0 ? `${Math.round(watched * 100)} percent watched` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <PressableScale
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens details"
      style={[styles.container, { width, height }]}
    >
      <Image
        source={{ uri: video.poster }}
        style={styles.poster}
        contentFit="cover"
        transition={Duration.fast}
        recyclingKey={video.id}
        cachePolicy="memory-disk"
      />

      {/* Quality flag, top-right. Text carries the meaning, not the color. */}
      {!!video.quality && (
        <View style={styles.qualityBadge}>
          <AppText variant="caption" style={styles.qualityText}>
            {video.quality}
          </AppText>
        </View>
      )}

      <LinearGradient colors={Gradients.cardScrim} style={styles.scrim}>
        <View style={styles.info}>
          <AppText variant="micro" numberOfLines={2} style={styles.title}>
            {video.title}
          </AppText>
          <View style={styles.metadata}>
            <AppText variant="caption" tone="muted">
              {video.releaseYear}
            </AppText>
            <View style={styles.rating}>
              <Ionicons
                name="star"
                size={IconSize.sm - 5}
                color={Palette.star}
                // Decorative — the number beside it is already announced.
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <AppText variant="caption" style={styles.ratingText}>
                {rating}
              </AppText>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Resume indicator, pinned to the card's bottom edge. */}
      {watched > 0 && (
        <ProgressBar fraction={watched} style={styles.watchBar} />
      )}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    overflow: "hidden",
    backgroundColor: Palette.muted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    // No elevation/shadow here: a black shadow on a true-black background is
    // invisible, and Android elevation on every cell of a grid is not free.
    // Spacing between cards is the list's job (gap), not the card's margin.
  },
  poster: { width: "100%", height: "100%" },
  scrim: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "58%",
    justifyContent: "flex-end",
  },
  info: { padding: Spacing.xs },
  title: { marginBottom: Spacing.xxs },
  metadata: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rating: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingText: { color: Palette.star },
  qualityBadge: {
    position: "absolute",
    top: Spacing.xs,
    right: Spacing.xs,
    paddingHorizontal: Spacing.xxs + 2,
    paddingVertical: 2,
    borderRadius: Radius.sm - 2,
    backgroundColor: Palette.scrim,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.borderStrong,
  },
  qualityText: { color: Palette.foreground, letterSpacing: 0.4 },
  watchBar: { position: "absolute", bottom: 0, left: 0, right: 0 },
});

export default OptimizedVideoCard;
