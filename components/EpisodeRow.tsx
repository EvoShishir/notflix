import {
  Duration,
  IconSize,
  Palette,
  Radius,
  Spacing,
} from "@/constants/theme";
import { getFraction, useWatchProgress } from "@/lib/watchProgress";
import { Episode } from "@/types";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { DownloadButton } from "./DownloadButton";
import { AppText } from "./ui/AppText";
import { PressableScale } from "./ui/PressableScale";
import { ProgressBar } from "./ui/ProgressBar";

export const EPISODE_ROW_HEIGHT = 108;
const THUMB_WIDTH = 152;
const THUMB_HEIGHT = 86;

interface EpisodeRowProps {
  episode: Episode;
  onPress: (episode: Episode) => void;
  /** Parent post id, so a downloaded episode groups under its show. */
  showId?: string;
  showTitle?: string;
}

/**
 * One episode, as a full-width list row.
 *
 * A vertical list beats a horizontal shelf here: episode titles get room to
 * breathe, the running order is obvious, and you can flick through 24 episodes
 * without dragging sideways 24 times. Fixed height so the list can be virtualised
 * with `getItemLayout`.
 */
export const EpisodeRow = memo(function EpisodeRow({
  episode,
  onPress,
  showId,
  showTitle,
}: EpisodeRowProps) {
  const watched = getFraction(useWatchProgress(episode.id));

  return (
    <View style={styles.wrapper}>
      <PressableScale
        onPress={() => onPress(episode)}
        accessibilityRole="button"
        accessibilityLabel={[
          `Episode ${episode.episodeNumber}`,
          episode.title,
          `${episode.duration} minutes`,
          watched > 0 ? `${Math.round(watched * 100)} percent watched` : null,
        ]
          .filter(Boolean)
          .join(", ")}
        accessibilityHint="Starts playback"
        scaleTo={0.985}
        style={styles.row}
      >
        <View style={styles.thumb}>
          <Image
            source={{ uri: episode.poster }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={Duration.fast}
            cachePolicy="memory-disk"
            recyclingKey={episode.id}
          />
          <View style={styles.playScrim}>
            <Ionicons
              name="play"
              size={IconSize.md}
              color={Palette.foreground}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </View>

          {/* How far into this episode you got. */}
          {watched > 0 && (
            <ProgressBar fraction={watched} style={styles.watchBar} />
          )}
        </View>

        <View style={styles.meta}>
          <AppText variant="caption" tone="accent">
            Episode {episode.episodeNumber}
          </AppText>
          <AppText variant="body" numberOfLines={2}>
            {episode.title}
          </AppText>
          <AppText variant="micro" tone="muted">
            {episode.duration}m
          </AppText>
        </View>
      </PressableScale>

      <DownloadButton
        request={{
          id: episode.id,
          title: episode.title,
          sourceUrl: episode.videoUrl,
          poster: episode.poster,
          backdrop: episode.backdrop,
          durationMinutes: episode.duration,
          showId: showId ?? null,
          showTitle: showTitle ?? null,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    height: EPISODE_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: Spacing.xxs,
    marginBottom: Spacing.xs,
    borderRadius: Radius.lg,
    backgroundColor: Palette.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    overflow: "hidden",
  },
  row: {
    flex: 1,
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    marginLeft: Spacing.xs,
    borderRadius: Radius.md,
    overflow: "hidden",
    backgroundColor: Palette.muted,
  },
  playScrim: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.28)",
  },
  meta: { flex: 1, gap: 2, paddingVertical: Spacing.xs },
  watchBar: { position: "absolute", bottom: 0, left: 0, right: 0 },
});
