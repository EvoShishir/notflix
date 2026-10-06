// Per-weight subpath imports, not the package root: importing the root pulls
// all 18 Inter faces into the bundle (~6 MB) instead of just the five we use.
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { Inter_800ExtraBold } from "@expo-google-fonts/inter/800ExtraBold";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useFonts } from "expo-font";
// SDK 56 decoupled expo-router from react-navigation; the theming
// primitives now ship from expo-router itself.
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import React, { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useMotionEnabled } from "@/components/ui/Motion";
import { Duration, FontFamily, Palette } from "@/constants/theme";
import { DataProvider } from "@/contexts/DataContext";
import { hydrateDownloads } from "@/lib/downloads";
import { hydratePlayerPrefs } from "@/lib/playerPrefs";
import { hydrateSubtitleStyle } from "@/lib/subtitleStyle";
import { hydrateSubtitlePrefs } from "@/lib/subtitles";
import { hydrateWatchProgress } from "@/lib/watchProgress";

// Hold the splash until fonts are ready, then cross-fade out of it so the app
// doesn't pop in. Failures here are non-fatal — a missed splash is not worth a crash.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Expo Go renders its own splash and warns if you try to configure ours, so only
// set the fade in a build that actually owns the splash screen.
if (Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) {
  SplashScreen.setOptions({ duration: Duration.slow, fade: true });
}

// Paint the window black behind the React tree so no white frame flashes
// between the splash and the first screen.
SystemUI.setBackgroundColorAsync(Palette.background).catch(() => {});

/**
 * Dark-only navigation theme.
 *
 * This product is dark by design (see design-system/notflix/MASTER.md), so the
 * light theme is deliberately not wired up — every surface is authored for OLED
 * black and the app config pins `userInterfaceStyle` to dark to match.
 */
const NotFlixTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Palette.accent,
    background: Palette.background,
    card: Palette.card,
    text: Palette.foreground,
    border: Palette.border,
    notification: Palette.accent,
  },
  fonts: {
    regular: { fontFamily: FontFamily.regular, fontWeight: "400" as const },
    medium: { fontFamily: FontFamily.medium, fontWeight: "500" as const },
    bold: { fontFamily: FontFamily.semibold, fontWeight: "600" as const },
    heavy: { fontFamily: FontFamily.bold, fontWeight: "700" as const },
  },
};

export default function RootLayout() {
  const motion = useMotionEnabled();
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  // Restore locally stored downloads and watch positions. Both are best-effort:
  // a failure here means an empty library, never a failed launch.
  useEffect(() => {
    void hydrateWatchProgress();
    void hydrateDownloads();
    void hydrateSubtitlePrefs();
    void hydrateSubtitleStyle();
    void hydratePlayerPrefs();
  }, []);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  if (!loaded) {
    // Matches the splash background, so the handoff is invisible.
    return <View style={{ flex: 1, backgroundColor: Palette.background }} />;
  }

  /**
   * Drill-down transition, shared by every push off the tabs.
   *
   * `ios_from_right` rather than `fade_from_bottom`, because on Android the
   * latter's *pop* animates only the departing screen — 150ms of fade plus an
   * 8% nudge — while the screen being revealed is given a literal no-op
   * animation. The result reads as an instant cut going back even though the
   * push looks fine. `ios_from_right` moves both screens in both directions,
   * with the background parallaxing at 30%, so forward and back are symmetric.
   *
   * With Reduce Motion on, this collapses to a short fade.
   */
  const drillDown = motion
    ? { animation: "ios_from_right" as const, animationDuration: Duration.slow }
    : { animation: "fade" as const, animationDuration: Duration.fast };

  return (
    // expo-router does not mount a GestureHandlerRootView of its own, and
    // without one react-native-gesture-handler silently does nothing on
    // Android — which is what drives the player's tap and scrub gestures.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <DataProvider>
          <ThemeProvider value={NotFlixTheme}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: Palette.background },
                // Keeps the edge-swipe back gesture working on iOS.
                gestureEnabled: true,
              }}
            >
              <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
              <Stack.Screen name="video/[id]" options={drillDown} />
              <Stack.Screen
                name="player/[id]"
                options={{
                  presentation: "fullScreenModal",
                  animation: "fade",
                  animationDuration: Duration.base,
                  // The player owns the whole screen; hide the OS bars with it.
                  autoHideHomeIndicator: true,
                  // Horizontal drags are the player's scrub gesture. Left on,
                  // the stack's swipe-back claimed them first, so swipe-seek
                  // never started while vertical swipes worked. Close is
                  // still the button and the back button/gesture.
                  gestureEnabled: false,
                }}
              />
              <Stack.Screen name="category/[id]" options={drillDown} />
              <Stack.Screen name="category-content/[id]" options={drillDown} />
              <Stack.Screen name="downloads/[showId]" options={drillDown} />
              <Stack.Screen name="+not-found" />
            </Stack>
            <StatusBar style="light" />
          </ThemeProvider>
        </DataProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
