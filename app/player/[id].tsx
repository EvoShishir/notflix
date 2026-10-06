import { DoubleTapSeek } from "@/components/player/DoubleTapSeek";
import { SettingsPanel } from "@/components/player/SettingsPanel";
import { VideoControls } from "@/components/player/VideoControls";
import { AppText } from "@/components/ui/AppText";
import { ErrorState } from "@/components/ui/StateViews";
import { Palette, Spacing } from "@/constants/theme";
import { getDownload, getPlayableUri } from "@/lib/downloads";
import {
  getSubtitlePref,
  importSubtitleFile,
  isSubtitleFile,
  setSubtitlePref,
  subtitleFileExists,
  useSubtitlePref,
} from "@/lib/subtitles";
import {
  getSubtitleStyle,
  sameSubtitleStyle,
  subtitleInitOptions,
  useSubtitleStyle,
} from "@/lib/subtitleStyle";
import { getResumePosition, recordProgress } from "@/lib/watchProgress";
import { apiService } from "@/services/api";
import { Episode, TVShow, Video } from "@/types";
// The view is the package's default export; the types are named.
import VLCPlayerView, {
  type VLCPlayerRef,
  type VLCPlayerTracks,
} from "@lunarr/vlc-player";
import * as DocumentPicker from "expo-document-picker";
import * as NavigationBar from "expo-navigation-bar";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";

/** Episode ids look like `<postId>-s1-e2`. */
const EPISODE_ID = /-s\d+-e\d+$/;
/** How long the controls linger after the last interaction. */
const AUTO_HIDE_MS = 3500;
/** Progress cadence: smooth enough for the scrub bar, cheap enough to ignore. */
const PROGRESS_MS = 250;
/**
 * How long to keep re-reading the track list after the media opens.
 *
 * `onLoad` fires on libVLC's Opening event, before the demuxer has registered
 * any streams, so a `getTracks()` there returns empty lists — and the library
 * never emits `onTracks` on its own. Polling on progress ticks for a window
 * covers however long the container takes to parse over the network.
 */
const TRACK_DISCOVERY_MS = 15_000;
/** Track selection and sidecar loading are applied on libVLC's input thread. */
const TRACK_SETTLE_MS = 2_000;
/**
 * Quiet period before a subtitle-style change is applied. Applying means
 * reloading the stream, so a burst of taps in the panel should cost one reload.
 */
const STYLE_APPLY_DELAY_MS = 700;

type Track = VLCPlayerTracks["audio"][number];

function sameTrackList(a: Track[], b: Track[]) {
  return (
    a.length === b.length &&
    a.every((t, i) => t.id === b[i].id && t.name === b[i].name)
  );
}

function findEpisode(show: TVShow, episodeId: string): Episode | null {
  for (const season of show.seasons) {
    for (const episode of season.episodes) {
      if (episode.id === episodeId) return episode;
    }
  }
  return null;
}

/**
 * Video player, built on libVLC.
 *
 * expo-video delegates decoding to ExoPlayer and AVPlayer, neither of which
 * ships AC3/E-AC3/DTS audio — which is why some MKVs played picture with no
 * sound. libVLC carries its own decoders, so format support no longer depends
 * on what the OS happens to license.
 *
 * The trade is that this is a native module outside Expo Go: the app now needs
 * a development build to run.
 */
export default function VideoPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const player = useRef<VLCPlayerRef>(null);

  // `Video` (not `VideoType`) because an episode is a Video without the
  // movie/series discriminant, and the player only needs title + videoUrl.
  const [video, setVideo] = useState<Video | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [playing, setPlaying] = useState(true);
  const [buffering, setBuffering] = useState(true);
  const [duration, setDuration] = useState(0);
  const [displayTime, setDisplayTime] = useState(0);

  const [controlsVisible, setControlsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  const [tracks, setTracks] = useState<VLCPlayerTracks>({
    audio: [],
    audioIndex: -1,
    subtitle: [],
    subtitleIndex: -1,
  });

  /** Progress ticks re-request tracks until this timestamp. */
  const trackPollUntil = useRef(0);

  /** Latest playback position in seconds, for restoring after a reload. */
  const positionRef = useRef(0);

  /**
   * What to put back after a reload. Set just before the source changes,
   * consumed in stages: the seek on load, the track choices once the new
   * instance has listed its tracks, the pause once it is actually playing.
   */
  const restoreRef = useRef<{
    time: number;
    audioId: number;
    subtitleId: number;
    paused: boolean;
    /** An external file re-selects itself when re-attached. */
    externalSub: boolean;
  } | null>(null);
  const pendingTracks = useRef<typeof restoreRef.current>(null);
  const pendingPause = useRef(false);

  const refreshTracks = useCallback((windowMs: number) => {
    trackPollUntil.current = Math.max(
      trackPollUntil.current,
      Date.now() + windowMs
    );
    player.current?.getTracks();
  }, []);

  const handleTracks = useCallback((next: VLCPlayerTracks) => {
    // libVLC lists a "Disable" pseudo-track (id -1) in both lists. The panel
    // supplies its own "Off" for subtitles, and nobody wants to mute audio
    // from a track picker.
    const audio = next.audio.filter((t) => t.id >= 0);
    const subtitle = next.subtitle.filter((t) => t.id >= 0);

    // Track ids come from the demuxer, so they are stable across a reload of
    // the same file and the previous choice can be put straight back.
    const pending = pendingTracks.current;
    if (pending && audio.length > 0) {
      pendingTracks.current = null;
      if (
        pending.audioId !== next.audioIndex &&
        audio.some((t) => t.id === pending.audioId)
      ) {
        player.current?.selectAudioTrack(pending.audioId);
      }
      if (
        !pending.externalSub &&
        pending.subtitleId !== next.subtitleIndex &&
        (pending.subtitleId < 0 ||
          subtitle.some((t) => t.id === pending.subtitleId))
      ) {
        player.current?.selectSubtitleTrack(pending.subtitleId);
      }
      refreshTracks(TRACK_SETTLE_MS);
    }

    // Polling delivers identical payloads several times a second; keep the
    // previous object so the screen doesn't re-render for nothing.
    setTracks((prev) =>
      prev.audioIndex === next.audioIndex &&
      prev.subtitleIndex === next.subtitleIndex &&
      sameTrackList(prev.audio, audio) &&
      sameTrackList(prev.subtitle, subtitle)
        ? prev
        : {
            audio,
            audioIndex: next.audioIndex,
            subtitle,
            subtitleIndex: next.subtitleIndex,
          }
    );
  }, [refreshTracks]);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubbing = useRef(false);
  const lastRecorded = useRef(0);
  /** Resume is applied once per title, on the first load after the id changes. */
  const resumedFor = useRef<string | null>(null);

  // Position drives the scrub bar from the UI thread, so a 4 Hz progress event
  // doesn't re-render the whole overlay.
  const progress = useSharedValue(0);
  const buffered = useSharedValue(0);

  /**
   * A completed download wins over the network URL, so a saved title plays
   * offline without any separate "offline mode".
   */
  const sourceUri = useMemo(() => {
    if (!video) return null;
    return getPlayableUri(video.id) ?? video.videoUrl ?? null;
  }, [video]);

  /**
   * Subtitle styling lives in LibVLC *instance* options, which the library only
   * reads when a new `source` arrives — so the style the player was built with
   * is tracked separately from the live preference, and catching up means a
   * reload.
   */
  const liveStyle = useSubtitleStyle();
  const [appliedStyle, setAppliedStyle] = useState(getSubtitleStyle);

  const source = useMemo(
    () =>
      sourceUri
        ? {
            uri: sourceUri,
            autoplay: true,
            isNetwork: !sourceUri.startsWith("file:"),
            initOptions: subtitleInitOptions(appliedStyle),
          }
        : undefined,
    [sourceUri, appliedStyle]
  );

  /* ------------------------------ orientation ----------------------------- */

  useEffect(() => {
    ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE
    ).catch(() => {});

    /**
     * Android's navigation bar is a separate surface from the status bar, so
     * hiding the status bar alone still left it on screen.
     */
    if (Platform.OS === "android") {
      NavigationBar.setVisibilityAsync("hidden").catch(() => {});
    }

    return () => {
      ScreenOrientation.unlockAsync().catch(() => {});
      if (Platform.OS === "android") {
        NavigationBar.setVisibilityAsync("visible").catch(() => {});
      }
    };
  }, []);

  /* ------------------------------- controls ------------------------------- */

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }, []);

  /**
   * Show the controls and arm the auto-hide.
   *
   * They never auto-hide while paused, while the settings panel is open, or
   * mid-scrub — pulling the UI out from under someone still using it is the
   * classic way to make a player feel hostile.
   */
  const revealControls = useCallback(
    (keepOpen = false) => {
      setControlsVisible(true);
      clearHideTimer();
      if (keepOpen) return;
      hideTimer.current = setTimeout(() => {
        if (!scrubbing.current) setControlsVisible(false);
      }, AUTO_HIDE_MS);
    },
    [clearHideTimer]
  );

  useEffect(() => {
    if (!playing || settingsOpen) {
      clearHideTimer();
      setControlsVisible(true);
    } else {
      revealControls();
    }
  }, [playing, settingsOpen, clearHideTimer, revealControls]);

  useEffect(() => clearHideTimer, [clearHideTimer]);

  const toggleControls = useCallback(() => {
    if (controlsVisible) {
      // Keep them up while paused — there is nothing to watch underneath.
      if (playing) {
        clearHideTimer();
        setControlsVisible(false);
      }
    } else {
      revealControls();
    }
  }, [controlsVisible, playing, clearHideTimer, revealControls]);

  /* -------------------------------- actions ------------------------------- */

  const togglePlay = useCallback(() => {
    if (playing) player.current?.pause();
    else player.current?.play();
    // Optimistic: the native state events confirm a moment later, but the button
    // must not sit on the wrong glyph until they arrive.
    setPlaying((p) => !p);
    revealControls();
  }, [playing, revealControls]);

  const seekTo = useCallback(
    (seconds: number) => {
      const clamped = Math.min(Math.max(seconds, 0), duration || seconds);
      player.current?.seek(clamped);
      setDisplayTime(Math.floor(clamped));
      if (duration > 0) progress.value = clamped / duration;
      revealControls();
    },
    [duration, progress, revealControls]
  );

  const seekBy = useCallback(
    (delta: number) => seekTo(displayTime + delta),
    [seekTo, displayTime]
  );

  const handleClose = useCallback(() => {
    player.current?.pause();
    router.back();
  }, [router]);

  /**
   * Pause as soon as the screen loses focus.
   *
   * This runs *before* unmount, so by the time libVLC tears the player down the
   * decoder is already idle. It also covers the routes the close button misses
   * — the Android hardware back button and the edge-swipe gesture — which is
   * why pausing only in `handleClose` was not enough.
   */
  useFocusEffect(
    useCallback(() => {
      return () => {
        try {
          player.current?.pause();
        } catch {
          // Already released; nothing to pause.
        }
      };
    }, [])
  );

  /* ------------------------------- subtitles ------------------------------ */

  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);
  const [subLabel, setSubLabel] = useState<string | null>(null);

  const subPref = useSubtitlePref(video?.id);

  /**
   * Subtitle delay is applied natively, in microseconds.
   *
   * VLC owns the rendering, so the shift is frame-accurate and free — which is
   * why the downloaded file is handed to the player rather than parsed and
   * drawn by the app.
   */
  useEffect(() => {
    player.current?.setSubtitleDelay(Math.round(subPref.offset * 1_000_000));
  }, [subPref.offset, subLabel]);

  /**
   * Load a subtitle file from the device.
   *
   * The picker is left unrestricted by MIME type on purpose: Android reports
   * `.srt` and `.ass` inconsistently (often `application/octet-stream`, often
   * nothing at all), so filtering by type hides the very files people are trying
   * to choose. The extension check below does the filtering instead.
   */
  const handleSubtitlePick = useCallback(async () => {
    if (!video) return;
    try {
      setSubError(null);

      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) return;

      if (!isSubtitleFile(asset.name)) {
        setSubError(`“${asset.name}” is not a subtitle file.`);
        return;
      }

      setSubLoading(true);

      const stored = await importSubtitleFile(video.id, asset.uri, asset.name);
      player.current?.setSubtitleFile(stored);

      setSubLabel(asset.name);
      setSubtitlePref(video.id, { fileUri: stored, label: asset.name });

      // Re-apply the stored shift to the newly loaded file.
      player.current?.setSubtitleDelay(Math.round(subPref.offset * 1_000_000));
      // The slave is attached asynchronously, so its track appears a beat later.
      refreshTracks(TRACK_SETTLE_MS);
    } catch (e) {
      setSubError(
        e instanceof Error ? e.message : "That file could not be loaded."
      );
    } finally {
      setSubLoading(false);
    }
  }, [video, subPref.offset, refreshTracks]);

  /**
   * Apply a changed subtitle style by rebuilding the player, then put back
   * where it was: position, chosen tracks, and paused state.
   */
  useEffect(() => {
    if (sameSubtitleStyle(liveStyle, appliedStyle)) return;
    const timer = setTimeout(() => {
      restoreRef.current = {
        time: positionRef.current,
        audioId: tracks.audioIndex,
        subtitleId: tracks.subtitleIndex,
        paused: !playing,
        externalSub: !!subLabel,
      };
      setBuffering(true);
      setAppliedStyle(liveStyle);
    }, STYLE_APPLY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [
    liveStyle,
    appliedStyle,
    tracks.audioIndex,
    tracks.subtitleIndex,
    playing,
    subLabel,
  ]);

  const handleSubtitleClear = useCallback(() => {
    player.current?.selectSubtitleTrack(-1);
    setSubLabel(null);
    setSubError(null);
    // Forget the file too, so reopening the title doesn't restore it.
    if (video) setSubtitlePref(video.id, { fileUri: undefined, label: undefined });
  }, [video]);

  const handleOffsetChange = useCallback(
    (next: number) => {
      if (video) setSubtitlePref(video.id, { offset: next });
    },
    [video]
  );

  /* --------------------------------- data --------------------------------- */

  const fetchVideoDetails = useCallback(async () => {
    /**
     * A completed download is self-sufficient: it carries the title, artwork,
     * runtime and the file itself, so playback must not depend on reaching the
     * API first.
     */
    const offline = getDownload(id);
    if (offline?.state === "completed") {
      setVideo({
        id: offline.id,
        title: offline.title,
        description: "",
        poster: offline.poster,
        backdrop: offline.backdrop,
        duration: offline.durationMinutes,
        releaseYear: 0,
        genres: [],
        rating: 0,
        videoUrl: offline.fileUri,
        quality: "",
        watchTime: "",
        ...(offline.seasonNumber && offline.episodeNumber
          ? {
              seasonNumber: offline.seasonNumber,
              episodeNumber: offline.episodeNumber,
            }
          : {}),
      } as Video);
      setError(null);
      setLoadingMeta(false);
      return;
    }

    try {
      setLoadingMeta(true);
      setError(null);

      if (EPISODE_ID.test(id)) {
        const postId = id.split("-s")[0];
        const show = apiService.convertIndividualPostToVideo(
          await apiService.fetchIndividualPost(postId)
        );
        if (show.type !== "tv") throw new Error("Expected a series");

        const episode = findEpisode(show, id);
        if (!episode) throw new Error("Episode not found");
        setVideo(episode);
      } else {
        setVideo(
          apiService.convertIndividualPostToVideo(
            await apiService.fetchIndividualPost(id)
          )
        );
      }
    } catch {
      setError(
        "We couldn't start this video. If you're offline, only downloaded titles are available."
      );
    } finally {
      setLoadingMeta(false);
    }
  }, [id]);

  useEffect(() => {
    fetchVideoDetails();
  }, [fetchVideoDetails]);

  /* ----------------------------- player events ---------------------------- */

  const progressMeta = useMemo(() => {
    const episode = video as Partial<Episode> | null;
    return {
      showId: EPISODE_ID.test(id) ? id.split("-s")[0] : null,
      title: video?.title,
      poster: video?.poster,
      seasonNumber: episode?.seasonNumber,
      episodeNumber: episode?.episodeNumber,
    };
  }, [video, id]);

  const handleProgress = useCallback(
    ({
      currentTime,
      duration: total,
    }: {
      currentTime: number;
      duration: number;
    }) => {
      if (total > 0) {
        setDuration((prev) => (prev === total ? prev : total));
        // A drag owns the bar until it is released; otherwise playback would
        // yank the thumb out from under the user's finger.
        if (!scrubbing.current) {
          progress.value = Math.min(currentTime / total, 1);
        }
      }

      // Frames are advancing, so whatever the last Buffering event claimed,
      // we are playing.
      setBuffering(false);

      positionRef.current = currentTime;
      if (Date.now() < trackPollUntil.current) player.current?.getTracks();

      const whole = Math.floor(currentTime);
      setDisplayTime((prev) => (prev === whole ? prev : whole));

      if (video && total > 0 && Math.abs(whole - lastRecorded.current) >= 5) {
        lastRecorded.current = whole;
        recordProgress(video.id, currentTime, total, progressMeta);
      }
    },
    [video, progressMeta, progress]
  );

  /**
   * Re-attach the subtitle file chosen previously for a title.
   *
   * Checked against disk rather than trusted blindly: the user may have
   * cleared app storage since, and handing libVLC a missing path would
   * silently leave them with no subtitles and no explanation.
   */
  const reattachSubtitleFile = useCallback(
    (videoId: string) => {
      const pref = getSubtitlePref(videoId);
      if (!pref.fileUri) return;
      void subtitleFileExists(pref.fileUri).then((exists) => {
        if (!exists) {
          setSubtitlePref(videoId, {
            fileUri: undefined,
            label: undefined,
          });
          return;
        }
        player.current?.setSubtitleFile(pref.fileUri!);
        player.current?.setSubtitleDelay(Math.round(pref.offset * 1_000_000));
        setSubLabel(pref.label ?? "Subtitle file");
        refreshTracks(TRACK_SETTLE_MS);
      });
    },
    [refreshTracks]
  );

  const handleLoad = useCallback(
    ({ duration: total }: { duration: number }) => {
      setBuffering(false);
      if (total > 0) setDuration(total);

      // Every open, not just the first per title: a new source means new tracks.
      refreshTracks(TRACK_DISCOVERY_MS);

      // A reload for a subtitle-style change: carry on exactly where we were,
      // rather than treating it as a fresh open of the title.
      const restore = restoreRef.current;
      if (restore) {
        restoreRef.current = null;
        if (restore.time > 0) {
          player.current?.seek(restore.time);
          setDisplayTime(Math.floor(restore.time));
        }
        pendingTracks.current = restore;
        pendingPause.current = restore.paused;
        if (video) reattachSubtitleFile(video.id);
        return;
      }

      if (!video || resumedFor.current === video.id) return;
      resumedFor.current = video.id;

      const resumeAt = getResumePosition(video.id);
      if (resumeAt > 0) {
        player.current?.seek(resumeAt);
        setDisplayTime(Math.floor(resumeAt));
      }

      reattachSubtitleFile(video.id);
    },
    [video, refreshTracks, reattachSubtitleFile]
  );

  /**
   * Latest values for the unmount handler below.
   *
   * Kept in a ref so that handler can depend on nothing: with `displayTime` in
   * its dependency array the effect tore down and re-ran every single second,
   * firing its "final" save once a second rather than once on exit.
   */
  const finalState = useRef({ video, duration, displayTime, progressMeta });

  useEffect(() => {
    finalState.current = { video, duration, displayTime, progressMeta };
  }, [video, duration, displayTime, progressMeta]);

  useEffect(() => {
    return () => {
      const { video: v, duration: d, displayTime: t, progressMeta: m } =
        finalState.current;

      // The 5s throttle during playback means the final seconds would
      // otherwise never be written.
      if (v && d > 0) recordProgress(v.id, t, d, m);

      /**
       * Release explicitly rather than leaving it to the native detach.
       *
       * libVLC's teardown calls `mediaPlayer.stop()` synchronously, and
       * stopping a *running* decoder blocks the UI thread — which is what made
       * the app hang on the way back from a playing title. The blur handler
       * above has already paused it, so this has almost nothing to do.
       * Releasing twice is safe: the native side no-ops once the handle is gone.
       */
      try {
        player.current?.release();
      } catch {
        // Already torn down by the native detach; nothing left to release.
      }
    };
  }, []);

  /* -------------------------------- render -------------------------------- */

  if (loadingMeta) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View
          style={styles.centered}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading video"
          accessibilityState={{ busy: true }}
        >
          <ActivityIndicator size="large" color={Palette.accent} />
          <AppText variant="body" tone="muted">
            Preparing playback…
          </AppText>
        </View>
      </View>
    );
  }

  if (error || !video || !source) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.centered}>
          <ErrorState
            title="Playback failed"
            message={error ?? "This title has no playable source."}
            onRetry={fetchVideoDetails}
          />
        </View>
      </View>
    );
  }

  const episode = video as Partial<Episode>;
  const contextLine =
    episode.seasonNumber && episode.episodeNumber
      ? `S${episode.seasonNumber} · E${episode.episodeNumber}`
      : undefined;

  return (
    <View style={styles.container}>
      {/*
        The status bar rides along with the controls: tap to bring both in, tap
        again to send both away.
      */}
      <StatusBar
        hidden={!controlsVisible}
        animated
        hideTransitionAnimation="fade"
        style="light"
      />

      <VLCPlayerView
        ref={player}
        source={source}
        style={StyleSheet.absoluteFill}
        paused={!playing}
        // Zoom-to-fill crops instead of letterboxing — useful on content whose
        // aspect doesn't match the device, so it's a toggle, not a fixed choice.
        resizeMode={zoomed ? "cover" : "contain"}
        progressUpdateInterval={PROGRESS_MS}
        // A video player has no business continuing in the background, and a
        // now-playing entry for it would be noise in the notification shade.
        continueAudioInBackground={false}
        showNowPlaying={false}
        onLoad={handleLoad}
        onProgress={handleProgress}
        onPlaying={() => {
          // Reloaded while paused: autoplay is what gets a frame on screen, so
          // let it start, then stop again.
          if (pendingPause.current) {
            pendingPause.current = false;
            player.current?.pause();
            setBuffering(false);
            return;
          }
          setPlaying(true);
          setBuffering(false);
        }}
        onPaused={() => setPlaying(false)}
        // VLC emits Buffering continuously as a *progress* event (0-100%), not
        // just when it stalls, and it carries `isBuffering` computed natively as
        // "not currently playing". Hardcoding `true` here pinned the spinner on
        // permanently the moment playback started.
        onBuffer={(e) => setBuffering(e.isBuffering ?? false)}
        onTracks={handleTracks}
        onEnd={() => {
          setPlaying(false);
          revealControls(true);
        }}
        onError={() =>
          setError(
            "This file could not be played. The format may be unsupported."
          )
        }
      />

      <DoubleTapSeek onSeek={seekBy} onSingleTap={toggleControls}>
        <VideoControls
          visible={controlsVisible}
          title={video.title}
          subtitle={contextLine}
          playing={playing}
          loading={buffering}
          duration={duration}
          currentTime={displayTime}
          progress={progress}
          buffered={buffered}
          zoomed={zoomed}
          subtitlesOn={tracks.subtitleIndex >= 0 || !!subLabel}
          onTogglePlay={togglePlay}
          onSeekBy={seekBy}
          onSeekTo={seekTo}
          onScrubStart={() => {
            scrubbing.current = true;
            revealControls(true);
          }}
          onScrubEnd={() => {
            scrubbing.current = false;
            revealControls();
          }}
          onToggleZoom={() => {
            setZoomed((z) => !z);
            revealControls();
          }}
          onOpenSettings={() => setSettingsOpen(true)}
          onClose={handleClose}
        />
      </DoubleTapSeek>

      <SettingsPanel
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        tracks={tracks}
        // Re-read after switching so the panel shows what is actually active.
        onSelectAudio={(trackId) => {
          player.current?.selectAudioTrack(trackId);
          refreshTracks(TRACK_SETTLE_MS);
        }}
        onSelectSubtitle={(trackId) => {
          player.current?.selectSubtitleTrack(trackId);
          refreshTracks(TRACK_SETTLE_MS);
        }}
        external={{
          activeLabel: subLabel,
          loading: subLoading,
          error: subError,
          onPick: handleSubtitlePick,
          onClear: handleSubtitleClear,
          offset: subPref.offset,
          onOffsetChange: handleOffsetChange,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.background },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
});
