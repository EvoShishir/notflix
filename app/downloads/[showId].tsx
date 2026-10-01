import { DOWNLOAD_ROW_HEIGHT, DownloadRow } from "@/components/DownloadRow";
import { useMotion } from "@/components/ui/Motion";
import { PressableScale } from "@/components/ui/PressableScale";
import {
  LargeTitle,
  StickyHeaderBar,
  useStickyHeaderHeight,
} from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/StateViews";
import {
  gutterFor,
  IconSize,
  Palette,
  Radius,
  Spacing,
  TouchTarget,
} from "@/constants/theme";
import {
  DownloadRecord,
  formatBytes,
  removeDownload,
  removeShowDownloads,
  useDownloads,
} from "@/lib/downloads";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { Alert, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function DownloadedShowScreen() {
  const { showId, name } = useLocalSearchParams<{
    showId: string;
    name: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { enter } = useMotion();
  const headerHeight = useStickyHeaderHeight();
  const gutter = gutterFor(width);
  const scrollY = useSharedValue(0);

  const downloads = useDownloads();

  const episodes = useMemo(
    () =>
      Object.values(downloads)
        .filter((record) => record.showId === showId)
        .sort(
          (a, b) =>
            (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0) ||
            (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0),
        ),
    [downloads, showId],
  );

  const totalBytes = useMemo(
    () => episodes.reduce((sum, record) => sum + record.bytesWritten, 0),
    [episodes],
  );

  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const confirmDeleteEpisode = useCallback((record: DownloadRecord) => {
    Alert.alert("Delete episode?", `“${record.title}” will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => void removeDownload(record.id),
      },
    ]);
  }, []);

  const confirmDeleteAll = useCallback(() => {
    Alert.alert(
      "Delete all episodes?",
      `All ${episodes.length} downloaded episodes will be removed from this device.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete all",
          style: "destructive",
          onPress: () => {
            void removeShowDownloads(showId);
            router.back();
          },
        },
      ],
    );
  }, [episodes.length, showId, router]);

  const renderItem = useCallback(
    ({ item, index }: { item: DownloadRecord; index: number }) => (
      <Animated.View entering={enter.rise(index, 45)}>
        <DownloadRow
          record={item}
          onPress={() => router.push(`/player/${item.id}`)}
          onDelete={() => confirmDeleteEpisode(item)}
        />
      </Animated.View>
    ),
    [enter, router, confirmDeleteEpisode],
  );

  return (
    <View style={styles.container}>
      <StickyHeaderBar
        title={name ?? "Downloads"}
        scrollY={scrollY}
        right={
          episodes.length > 0 ? (
            <PressableScale
              onPress={confirmDeleteAll}
              accessibilityRole="button"
              accessibilityLabel="Delete all downloaded episodes"
              style={styles.headerAction}
            >
              <Ionicons
                name="trash-outline"
                size={IconSize.md}
                color={Palette.foreground}
              />
            </PressableScale>
          ) : undefined
        }
      />

      <Animated.FlatList
        data={episodes}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingBottom: insets.bottom + Spacing.xxl,
        }}
        ListHeaderComponent={
          <LargeTitle
            eyebrow="Downloaded"
            title={name ?? "Show"}
            subtitle={
              episodes.length
                ? `${episodes.length} episode${
                    episodes.length === 1 ? "" : "s"
                  }${totalBytes ? ` · ${formatBytes(totalBytes)}` : ""}`
                : undefined
            }
            offset={headerHeight}
            style={styles.title}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="cloud-download-outline"
            title="No episodes here"
            message="Every episode of this show has been removed from the device."
            actionLabel="Back to downloads"
            onAction={() => router.back()}
          />
        }
        getItemLayout={(_, i) => ({
          length: DOWNLOAD_ROW_HEIGHT + Spacing.xs,
          offset: (DOWNLOAD_ROW_HEIGHT + Spacing.xs) * i,
          index: i,
        })}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={9}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.background },
  title: { paddingHorizontal: 0 },
  headerAction: {
    width: TouchTarget,
    height: TouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.pill,
  },
});
