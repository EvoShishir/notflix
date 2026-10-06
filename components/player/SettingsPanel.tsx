import { AppText } from "@/components/ui/AppText";
import { useMotionEnabled } from "@/components/ui/Motion";
import { PressableScale } from "@/components/ui/PressableScale";
import {
  Duration,
  Easings,
  IconSize,
  Palette,
  Radius,
  Spacing,
  TouchTarget,
} from "@/constants/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { VLCPlayerTracks } from "@lunarr/vlc-player";
import React, { useCallback, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  SlideInRight,
  SlideOutRight,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScreenHeight } from "@/hooks/useScreenHeight";
import {
  type AudioOutput,
  setPlayerPrefs,
  useAudioOutput,
} from "@/lib/playerPrefs";
import { ExternalSubtitles } from "./ExternalSubtitles";
import { DropdownOption, OptionDropdown } from "./OptionDropdown";
import { SubtitleStyleSection } from "./SubtitleStyleSection";

/**
 * libVLC's two Android audio outputs. AudioTrack is its default; OpenSL ES is
 * the fallback VLC's own app offers when audio starts late or stutters.
 */
const AUDIO_OUTPUTS: DropdownOption[] = [
  { key: "audiotrack", label: "AudioTrack", sublabel: "Default" },
  {
    key: "opensles",
    label: "OpenSL ES",
    sublabel: "Try this if audio starts late or stutters",
  },
];

/** libVLC uses -1 to mean "no subtitle track". */
const SUBTITLES_OFF = -1;

/**
 * Human label for a track.
 *
 * `label` is what the stream author wrote and is already localised for the
 * device, so prefer it; fall back to expanding the BCP-47 language tag, and only
 * then to the raw tag.
 */
export function trackLabel(track: { label?: string; language?: string }) {
  if (track.label?.trim()) return track.label.trim();
  if (track.language) {
    try {
      const display = new Intl.DisplayNames(undefined, { type: "language" });
      return display.of(track.language) ?? track.language;
    } catch {
      return track.language;
    }
  }
  return "Unknown";
}

interface SettingsPanelProps {
  /**
   * Everything the external-subtitles section needs. Expansion is omitted
   * because the panel owns it — only one group may be open at a time.
   */
  external: Omit<
    React.ComponentProps<typeof ExternalSubtitles>,
    "expanded" | "onToggle"
  >;
  visible: boolean;
  onClose: () => void;
  /** Audio and subtitle tracks libVLC found in the media. */
  tracks: VLCPlayerTracks;
  /** Track ids come straight from `onTracks`; -1 disables. */
  onSelectAudio: (trackId: number) => void;
  onSelectSubtitle: (trackId: number) => void;
}

/**
 * Player settings, as a panel that slides in from the right edge.
 *
 * A side panel rather than a bottom sheet because the player runs in landscape,
 * where vertical space is the scarce axis — a sheet would cover most of the
 * picture, while this takes a slice of the long edge and leaves the video
 * watchable underneath.
 *
 * Tracks come from the player itself (`availableAudioTracks` /
 * `availableSubtitleTracks`), which reads them out of the stream manifest, so
 * this reflects what the file actually contains rather than what the catalog API
 * claims.
 */
export function SettingsPanel({
  external,
  visible,
  onClose,
  tracks,
  onSelectAudio,
  onSelectSubtitle,
}: SettingsPanelProps) {
  const insets = useSafeAreaInsets();
  const screenHeight = useScreenHeight();
  const audioOutput = useAudioOutput();
  const motion = useMotionEnabled();
  const { width } = useWindowDimensions();

  // Wide enough to read a language list, never more than ~two-thirds of a phone
  // held sideways.
  const panelWidth = Math.min(Math.max(width * 0.42, 300), 420);

  // Only one group is open at a time, so the panel never outgrows the screen.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const toggleGroup = useCallback(
    (key: string) => setOpenGroup((prev) => (prev === key ? null : key)),
    []
  );

  /**
   * VLC identifies tracks by an opaque numeric id rather than a language/label
   * pair, so the dropdown keys are those ids stringified — no fuzzy matching
   * needed to work out which one is selected.
   */
  const audioOptions = useMemo<DropdownOption[]>(
    () =>
      tracks.audio.map((track) => ({
        key: String(track.id),
        label: track.name || "Unnamed track",
      })),
    [tracks.audio]
  );

  const subtitleOptions = useMemo<DropdownOption[]>(
    () => [
      { key: String(SUBTITLES_OFF), label: "Off" },
      ...tracks.subtitle.map((track) => ({
        key: String(track.id),
        label: track.name || "Unnamed track",
      })),
    ],
    [tracks.subtitle]
  );

  const activeAudioLabel =
    tracks.audio.find((t) => t.id === tracks.audioIndex)?.name ?? "Default";
  const activeSubtitleLabel =
    tracks.subtitle.find((t) => t.id === tracks.subtitleIndex)?.name ?? "Off";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      supportedOrientations={["portrait", "landscape"]}
      onRequestClose={onClose}
    >
      <Animated.View
        entering={motion ? FadeIn.duration(Duration.fast) : undefined}
        exiting={motion ? FadeOut.duration(Duration.instant) : undefined}
        style={[styles.backdrop, { height: screenHeight }]}
      >
        {/* Tapping the video still showing on the left closes the panel. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close settings"
        />

        <Animated.View
          entering={
            motion
              ? SlideInRight.duration(Duration.base)
                  .easing(Easings.out)
                  .reduceMotion(ReduceMotion.System)
              : undefined
          }
          exiting={
            motion
              ? SlideOutRight.duration(Duration.fast).easing(Easings.in)
              : undefined
          }
          style={[
            styles.panel,
            {
              width: panelWidth + insets.right,
              paddingTop: Math.max(insets.top, Spacing.md),
              paddingBottom: Math.max(insets.bottom, Spacing.md),
              paddingRight: insets.right + Spacing.sm,
            },
          ]}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <AppText variant="title" accessibilityRole="header">
              Settings
            </AppText>
            <PressableScale
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
              style={styles.close}
            >
              <Ionicons
                name="close"
                size={IconSize.lg}
                color={Palette.foreground}
              />
            </PressableScale>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <AppText variant="label" tone="muted" style={styles.sectionLabel}>
              Audio
            </AppText>
            <OptionDropdown
              title="Audio track"
              valueLabel={activeAudioLabel}
              options={audioOptions}
              selectedKey={String(tracks.audioIndex)}
              onSelect={(key) => onSelectAudio(Number(key))}
              expanded={openGroup === "audio"}
              onToggle={() => toggleGroup("audio")}
              emptyMessage="This video has a single audio track."
            />
            <OptionDropdown
              title="Audio output"
              valueLabel={
                AUDIO_OUTPUTS.find((o) => o.key === audioOutput)?.label ??
                "AudioTrack"
              }
              options={AUDIO_OUTPUTS}
              selectedKey={audioOutput}
              // Applied by the player, which rebuilds at the same position.
              onSelect={(key) =>
                setPlayerPrefs({ audioOutput: key as AudioOutput })
              }
              expanded={openGroup === "output"}
              onToggle={() => toggleGroup("output")}
            />

            <AppText variant="label" tone="muted" style={styles.sectionLabel}>
              Subtitles
            </AppText>
            <OptionDropdown
              title="Subtitle track"
              valueLabel={activeSubtitleLabel}
              options={subtitleOptions}
              selectedKey={String(tracks.subtitleIndex)}
              onSelect={(key) => onSelectSubtitle(Number(key))}
              expanded={openGroup === "subtitles"}
              onToggle={() => toggleGroup("subtitles")}
            />

            <ExternalSubtitles
              {...external}
              expanded={openGroup === "external"}
              onToggle={() => toggleGroup("external")}
            />

            <SubtitleStyleSection
              expanded={openGroup === "style"}
              onToggle={() => toggleGroup("style")}
            />

            {tracks.subtitle.length === 0 && (
              <AppText variant="small" tone="muted" style={styles.note}>
                This file has no embedded subtitles. Load a subtitle file from
                your device above.
              </AppText>
            )}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    // Height comes from useScreenHeight; flex: 1 stops short on Android.
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  panel: {
    height: "100%",
    backgroundColor: Palette.card,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Palette.borderStrong,
    paddingLeft: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  close: {
    width: TouchTarget,
    height: TouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.pill,
  },
  scrollContent: { paddingBottom: Spacing.lg },
  sectionLabel: {
    paddingHorizontal: Spacing.xs,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  note: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm },
});
