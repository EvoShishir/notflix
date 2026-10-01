import {
  Duration,
  IconSize,
  Palette,
  Radius,
  Spacing,
  TouchTarget,
} from "@/constants/theme";
import {
  DownloadRecord,
  downloadFraction,
  formatBytes,
  pauseDownload,
  resumeDownload,
} from "@/lib/downloads";
import { getFraction, useWatchProgress } from "@/lib/watchProgress";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import React from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "./ui/AppText";
import { PressableScale } from "./ui/PressableScale";
import { ProgressBar } from "./ui/ProgressBar";

export const DOWNLOAD_ROW_HEIGHT = 96;
const THUMB_WIDTH = 132;

/** Human-readable transfer state, including how far along it is. */
export function statusLabel(record: DownloadRecord) {
  switch (record.state) {
    case "completed":
      return formatBytes(record.bytesWritten) || "Downloaded";
    case "downloading": {
      const pct = Math.round(downloadFraction(record) * 100);
      const size = record.bytesTotal
        ? ` of ${formatBytes(record.bytesTotal)}`
        : "";
      return `Downloading ${pct}%${size}`;
    }
    case "assembling":
      return "Finishing up…";
    case "paused":
      return record.bytesTotal
        ? `Paused · ${formatBytes(record.bytesWritten)} of ${formatBytes(record.bytesTotal)}`
        : "Paused";
    case "failed":
      return record.error ?? "Failed";
    default:
      return "Queued";
  }
}

/**
 * Pause / resume control.
 *
 * Split out as its own button rather than folded into the row's tap target:
 * tapping the row plays, and a transfer you want to suspend shouldn't require
 * discovering that the same tap means something different mid-download.
 */
function TransferControl({ record }: { record: DownloadRecord }) {
  const { state } = record;

  // Nothing to pause or resume once it's on disk, and assembly can't be stopped.
  if (state === "completed" || state === "assembling") return null;

  const paused = state === "paused" || state === "failed";

  return (
    <PressableScale
      onPress={() =>
        paused ? resumeDownload(record.id) : void pauseDownload(record.id)
      }
      accessibilityRole="button"
      accessibilityLabel={
        paused
          ? `Resume downloading ${record.title}`
          : `Pause downloading ${record.title}`
      }
      style={styles.action}
    >
      <Ionicons
        name={paused ? "play" : "pause"}
        size={IconSize.md}
        color={Palette.foreground}
      />
    </PressableScale>
  );
}

interface DownloadRowProps {
  record: DownloadRecord;
  /** Tapping the row — play when ready, or open a show. */
  onPress: () => void;
  onDelete: () => void;
  /** Overrides the record's own title (used for show groups). */
  title?: string;
  /** Replaces the status line (e.g. "4 episodes · 2.1 GB"). */
  subtitle?: string;
  /** Show a chevron instead of a play badge, for rows that drill in. */
  drillIn?: boolean;
  /** Hide the pause/resume control (show groups aggregate many transfers). */
  hideTransferControl?: boolean;
}

/**
 * One downloaded item, as a full-width row.
 *
 * Rows rather than a poster grid because every download needs three distinct
 * affordances — play, pause/resume, delete — and a tile can only really carry
 * one. Delete in particular was previously a long-press, which is undiscoverable
 * and the reason movies couldn't be removed.
 */
export function DownloadRow({
  record,
  onPress,
  onDelete,
  title,
  subtitle,
  drillIn,
  hideTransferControl,
}: DownloadRowProps) {
  const watched = getFraction(useWatchProgress(record.id));
  const ready = record.state === "completed";
  const fraction = downloadFraction(record);
  const label = title ?? record.title;
  const status = subtitle ?? statusLabel(record);

  const position =
    record.seasonNumber && record.episodeNumber
      ? `S${record.seasonNumber} E${record.episodeNumber}`
      : null;

  return (
    <View style={styles.wrapper}>
      <PressableScale
        onPress={onPress}
        // A partial file can't play; a show group always opens.
        disabled={!drillIn && !ready}
        accessibilityRole="button"
        accessibilityLabel={[
          position,
          label,
          status,
          watched > 0 ? `${Math.round(watched * 100)} percent watched` : null,
        ]
          .filter(Boolean)
          .join(", ")}
        accessibilityHint={
          drillIn ? "Opens the downloaded episodes" : ready ? "Plays offline" : undefined
        }
        scaleTo={0.985}
        style={styles.main}
      >
        <View style={styles.thumb}>
          <Image
            source={{ uri: record.poster }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={Duration.fast}
            cachePolicy="memory-disk"
            recyclingKey={record.id}
          />

          {(ready || drillIn) && (
            <View style={styles.badge}>
              <Ionicons
                name={drillIn ? "albums" : "play"}
                size={IconSize.md}
                color={Palette.foreground}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            </View>
          )}

          {watched > 0 && (
            <ProgressBar fraction={watched} style={styles.watchBar} />
          )}
        </View>

        <View style={styles.meta}>
          {position && (
            <AppText variant="caption" tone="accent">
              {position}
            </AppText>
          )}
          <AppText variant="body" numberOfLines={2}>
            {label}
          </AppText>
          <AppText
            variant="micro"
            tone={record.state === "failed" ? "accent" : "muted"}
          >
            {status}
          </AppText>
          {!ready && !drillIn && record.state !== "failed" && (
            <ProgressBar fraction={fraction} height={2} />
          )}
        </View>
      </PressableScale>

      {!hideTransferControl && <TransferControl record={record} />}

      <PressableScale
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${label}`}
        style={styles.action}
      >
        <Ionicons
          name="trash-outline"
          size={IconSize.md}
          color={Palette.mutedForeground}
        />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: DOWNLOAD_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xs,
    borderRadius: Radius.lg,
    backgroundColor: Palette.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    overflow: "hidden",
  },
  main: {
    flex: 1,
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  thumb: { width: THUMB_WIDTH, height: "100%", backgroundColor: Palette.muted },
  badge: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  watchBar: { position: "absolute", bottom: 0, left: 0, right: 0 },
  meta: { flex: 1, gap: 2, paddingVertical: Spacing.xs },
  action: {
    width: TouchTarget,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});
