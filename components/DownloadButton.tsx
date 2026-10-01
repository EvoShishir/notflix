import {
  cancelDownload,
  downloadFraction,
  DownloadRequest,
  pauseDownload,
  removeDownload,
  resumeDownload,
  startDownload,
  useDownload,
} from "@/lib/downloads";
import React, { useCallback } from "react";
import { Alert, StyleSheet, View } from "react-native";

import {
  IconSize,
  Palette,
  Radius,
  Spacing,
  TouchTarget,
} from "@/constants/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText } from "./ui/AppText";
import { PressableScale } from "./ui/PressableScale";
import { ProgressBar } from "./ui/ProgressBar";

interface DownloadButtonProps {
  request: DownloadRequest;
  /** Show a text label beside the icon (detail page) or icon only (list rows). */
  withLabel?: boolean;
}

/**
 * Download control for one title.
 *
 * A single button that reflects and advances the transfer's state: start →
 * pause → resume → delete. Every state has a distinct icon *and* a distinct
 * accessible name, so the state is never carried by the glyph alone.
 * Destructive steps confirm first — a delete throws away what may be a
 * multi-gigabyte transfer.
 */
export function DownloadButton({ request, withLabel }: DownloadButtonProps) {
  const record = useDownload(request.id);
  const state = record?.state;
  const fraction = downloadFraction(record);
  const inFlight = state === "downloading" || state === "queued";
  // Assembling is not interruptible — the file is mid-join on disk.
  const busy = state === "assembling";

  const confirmDelete = useCallback(() => {
    Alert.alert(
      "Remove download?",
      `“${request.title}” will be deleted from this device.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => void removeDownload(request.id),
        },
      ],
    );
  }, [request.id, request.title]);

  const confirmCancel = useCallback(() => {
    Alert.alert("Stop downloading?", "Progress so far will be discarded.", [
      { text: "Keep downloading", style: "cancel" },
      {
        text: "Stop",
        style: "destructive",
        onPress: () => void cancelDownload(request.id),
      },
    ]);
  }, [request.id]);

  const handlePress = useCallback(() => {
    switch (state) {
      case "assembling":
        // Nothing sensible to do mid-join; the button is disabled anyway.
        return;
      case "downloading":
        void pauseDownload(request.id);
        return;
      case "queued":
        confirmCancel();
        return;
      case "paused":
      case "failed":
        resumeDownload(request.id);
        return;
      case "completed":
        confirmDelete();
        return;
      default:
        startDownload(request);
    }
  }, [state, request, confirmCancel, confirmDelete]);

  const { icon, label, tint } = describe(state);

  return (
    <PressableScale
      onPress={handlePress}
      disabled={busy}
      // Pausing is the tap action, so stopping outright needs its own gesture.
      onLongPress={inFlight ? confirmCancel : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${request.title}`}
      accessibilityHint={
        state === "downloading"
          ? `${Math.round(fraction * 100)} percent complete. Long press to stop.`
          : undefined
      }
      style={[styles.button, withLabel && styles.pill]}
    >
      <View style={withLabel ? styles.pillRow : styles.glyph}>
        <Ionicons name={icon} size={IconSize.md} color={tint} />
        {withLabel && (
          <AppText variant="bodyStrong" style={{ color: tint }}>
            {label}
          </AppText>
        )}
      </View>

      {/*
        A determinate bar under the glyph while transferring. `bytesTotal` is 0
        when the server sends no Content-Length, and the bar renders nothing at
        0 rather than showing a misleading empty track.
      */}
      {(inFlight || busy) && (
        <ProgressBar fraction={fraction} height={2} style={styles.progress} />
      )}
    </PressableScale>
  );
}

function describe(state: string | undefined): {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  tint: string;
} {
  switch (state) {
    case "completed":
      return {
        icon: "checkmark-circle",
        label: "Downloaded",
        tint: Palette.accent,
      };
    case "downloading":
      return { icon: "pause", label: "Downloading", tint: Palette.foreground };
    case "assembling":
      return {
        icon: "hourglass-outline",
        label: "Finishing",
        tint: Palette.mutedForeground,
      };
    case "queued":
      return {
        icon: "time-outline",
        label: "Queued",
        tint: Palette.mutedForeground,
      };
    case "paused":
      return {
        icon: "play-circle-outline",
        label: "Paused",
        tint: Palette.mutedForeground,
      };
    case "failed":
      return {
        icon: "refresh-circle",
        label: "Retry",
        tint: Palette.destructive,
      };
    default:
      return {
        icon: "download-outline",
        label: "Download",
        tint: Palette.foreground,
      };
  }
}

const styles = StyleSheet.create({
  button: {
    minWidth: TouchTarget,
    minHeight: TouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.pill,
    gap: 2,
  },
  /**
   * Beside a primary CTA the control needs to read as a peer button, not a
   * bare icon with a caption squeezed between two pills.
   */
  pill: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Palette.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.borderStrong,
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  glyph: { alignItems: "center", justifyContent: "center" },
  progress: { position: "absolute", bottom: 3, left: 12, right: 12 },
});
