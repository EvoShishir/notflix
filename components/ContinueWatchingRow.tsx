import {
  Duration,
  gutterFor,
  IconSize,
  Palette,
  Radius,
  Spacing,
  TouchTarget,
} from "@/constants/theme";
import {
  clearProgress,
  getFraction,
  useContinueWatching,
  WatchRecord,
} from "@/lib/watchProgress";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import { AppText } from "./ui/AppText";
import { useMotion } from "./ui/Motion";
import { PressableScale } from "./ui/PressableScale";
import { ProgressBar } from "./ui/ProgressBar";

/** 16:9 cards, so a resume tile reads as "a moment in a video", not a poster. */
const CARD_RATIO = 16 / 9;

function remainingLabel(record: WatchRecord) {
  const left = Math.max(record.duration - record.position, 0);
  const minutes = Math.round(left / 60);
  if (minutes < 1) return "Almost done";
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m left`;
}

function ResumeCard({
  record,
  width,
  onPress,
  onRemove,
}: {
  record: WatchRecord;
  width: number;
  onPress: () => void;
  onRemove: () => void;
}) {
  const height = Math.round(width / CARD_RATIO);
  const fraction = getFraction(record);

  const episodeLabel =
    record.seasonNumber && record.episodeNumber
      ? `S${record.seasonNumber} E${record.episodeNumber}`
      : null;

  return (
    <View style={{ width }}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={[
          record.title ?? "Untitled",
          episodeLabel,
          `${Math.round(fraction * 100)} percent watched`,
          remainingLabel(record),
        ]
          .filter(Boolean)
          .join(", ")}
        accessibilityHint="Resumes playback"
        style={[styles.card, { width, height }]}
      >
        <Image
          source={{ uri: record.poster }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={Duration.fast}
          cachePolicy="memory-disk"
          recyclingKey={record.id}
        />
        <LinearGradient
          colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.85)"]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={styles.playBadge}>
          <Ionicons
            name="play"
            size={IconSize.md}
            color={Palette.foreground}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </View>

        {episodeLabel && (
          <View style={styles.episodeBadge}>
            <AppText variant="caption">{episodeLabel}</AppText>
          </View>
        )}

        <ProgressBar fraction={fraction} style={styles.progress} />
      </PressableScale>

      <View style={styles.meta}>
        <View style={styles.metaText}>
          <AppText variant="micro" numberOfLines={1}>
            {record.title ?? "Untitled"}
          </AppText>
          <AppText variant="caption" tone="muted">
            {remainingLabel(record)}
          </AppText>
        </View>

        {/* Removing a row is the only way to clear something you don't intend
            to finish, so it needs its own control rather than a hidden gesture. */}
        <PressableScale
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${record.title ?? "this title"} from Continue watching`}
          style={styles.remove}
        >
          <Ionicons
            name="close"
            size={IconSize.sm}
            color={Palette.mutedForeground}
          />
        </PressableScale>
      </View>
    </View>
  );
}

/**
 * "Continue watching" shelf.
 *
 * Reads straight from the local progress store, so it is populated before the
 * home feed has loaded and still works with no connection. Renders nothing at
 * all when there is nothing part-watched — an empty shelf with a heading is
 * just noise at the top of the page.
 */
export function ContinueWatchingRow({
  onResume,
}: {
  onResume: (videoId: string) => void;
}) {
  const records = useContinueWatching();
  const { width } = useWindowDimensions();
  const { enter } = useMotion();

  const gutter = gutterFor(width);
  const cardWidth = Math.round(
    Math.min((width - gutter * 2) / 1.6, 320)
  );
  const stride = cardWidth + Spacing.sm;

  const handleRemove = useCallback((record: WatchRecord) => {
    Alert.alert(
      "Remove from Continue watching?",
      `“${record.title ?? "This title"}” will no longer appear here. Your place is forgotten.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => clearProgress(record.id),
        },
      ]
    );
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: WatchRecord }) => (
      <ResumeCard
        record={item}
        width={cardWidth}
        onPress={() => onResume(item.id)}
        onRemove={() => handleRemove(item)}
      />
    ),
    [cardWidth, onResume, handleRemove]
  );

  if (records.length === 0) return null;

  return (
    <Animated.View entering={enter.rise(0, 60)} style={styles.container}>
      <View style={[styles.header, { paddingHorizontal: gutter }]}>
        <AppText variant="title" accessibilityRole="header">
          Continue watching
        </AppText>
      </View>

      <FlatList
        data={records}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: gutter,
          gap: Spacing.sm,
        }}
        snapToInterval={stride}
        snapToAlignment="start"
        decelerationRate="fast"
        getItemLayout={(_, i) => ({
          length: stride,
          offset: stride * i,
          index: i,
        })}
        initialNumToRender={3}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews={false}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.lg },
  header: { marginBottom: Spacing.sm },
  card: {
    borderRadius: Radius.lg,
    overflow: "hidden",
    backgroundColor: Palette.muted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
  playBadge: {
    position: "absolute",
    left: Spacing.xs,
    bottom: Spacing.sm,
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    backgroundColor: Palette.scrim,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 2,
  },
  episodeBadge: {
    position: "absolute",
    top: Spacing.xs,
    left: Spacing.xs,
    paddingHorizontal: Spacing.xxs + 2,
    paddingVertical: 2,
    borderRadius: Radius.sm - 2,
    backgroundColor: Palette.scrim,
  },
  progress: { position: "absolute", bottom: 0, left: 0, right: 0 },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xxs,
    marginTop: Spacing.xs,
  },
  metaText: { flex: 1, gap: 1 },
  remove: {
    width: TouchTarget - 12,
    height: TouchTarget - 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.pill,
  },
});
