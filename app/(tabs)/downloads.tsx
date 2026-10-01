import { DOWNLOAD_ROW_HEIGHT, DownloadRow } from "@/components/DownloadRow";
import { useMotion } from "@/components/ui/Motion";
import { LargeTitle } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/StateViews";
import { gutterFor, Palette, Spacing } from "@/constants/theme";
import { useTabBarClearance } from "@/hooks/useTabBarClearance";
import {
  DownloadGroup,
  formatBytes,
  groupDownloads,
  removeDownload,
  removeShowDownloads,
  useDownloads,
} from "@/lib/downloads";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { Alert, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function DownloadsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { clearance } = useTabBarClearance();
  const { enter } = useMotion();

  const downloads = useDownloads();
  const groups = useMemo(() => groupDownloads(downloads), [downloads]);
  const gutter = gutterFor(width);

  const totalBytes = useMemo(
    () => groups.reduce((sum, group) => sum + group.bytes, 0),
    [groups]
  );

  const handlePress = useCallback(
    (group: DownloadGroup) => {
      if (group.kind === "show") {
        router.push({
          pathname: "/downloads/[showId]",
          params: { showId: group.items[0].showId ?? "", name: group.title },
        });
        return;
      }
      const record = group.items[0];
      if (record.state === "completed") router.push(`/player/${record.id}`);
    },
    [router]
  );

  const handleDelete = useCallback((group: DownloadGroup) => {
    const isShow = group.kind === "show";
    Alert.alert(
      isShow ? "Delete all episodes?" : "Delete download?",
      isShow
        ? `All ${group.items.length} downloaded episodes of “${group.title}” will be removed from this device.`
        : `“${group.title}” will be removed from this device.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            if (isShow && group.items[0].showId) {
              void removeShowDownloads(group.items[0].showId);
            } else {
              void removeDownload(group.items[0].id);
            }
          },
        },
      ]
    );
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: DownloadGroup; index: number }) => {
      const isShow = item.kind === "show";
      const pending = item.items.filter((r) => r.state !== "completed").length;

      return (
        <Animated.View entering={enter.rise(index, 45)}>
          <DownloadRow
            // A show group is represented by its first episode's artwork, with
            // the group's own title and a summary in place of the status line.
            record={item.items[0]}
            title={item.title}
            subtitle={
              isShow
                ? [
                    `${item.items.length} episode${item.items.length === 1 ? "" : "s"}`,
                    pending > 0 ? `${pending} in progress` : null,
                    formatBytes(item.bytes) || null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : undefined
            }
            drillIn={isShow}
            // Per-episode pause lives inside the show, where it can act on one
            // transfer rather than an ambiguous group of them.
            hideTransferControl={isShow}
            onPress={() => handlePress(item)}
            onDelete={() => handleDelete(item)}
          />
        </Animated.View>
      );
    },
    [enter, handlePress, handleDelete]
  );

  return (
    <View style={styles.container}>
      <Animated.FlatList
        data={groups}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingBottom: clearance,
        }}
        ListHeaderComponent={
          <LargeTitle
            eyebrow="Offline"
            title="Downloads"
            subtitle={
              groups.length === 0
                ? "Watch without a connection"
                : `${groups.length} item${groups.length === 1 ? "" : "s"}${
                    totalBytes ? ` · ${formatBytes(totalBytes)}` : ""
                  }`
            }
            offset={insets.top}
            style={styles.header}
          />
        }
        ListEmptyComponent={
          <Animated.View entering={enter.rise(0)}>
            <EmptyState
              icon="cloud-download-outline"
              title="Nothing downloaded yet"
              message="Tap the download icon on a film or episode and it will be saved here for offline viewing."
              actionLabel="Browse titles"
              onAction={() => router.push("/")}
            />
          </Animated.View>
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
  header: { paddingHorizontal: 0 },
});
