/**
 * Tab bar surface for Android and web.
 *
 * iOS gets a real system blur (see TabBarBackground.ios.tsx). Here we use a
 * near-opaque glass panel with a soft gradient at its top edge so content
 * scrolling underneath fades out instead of hard-cutting at the bar.
 */

import { Gradients, Palette } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";

export default function TabBarBackground() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        // Reversed top scrim: transparent at the top, solid at the bottom.
        colors={[...Gradients.topScrim].reverse() as [string, string]}
        style={styles.fade}
        pointerEvents="none"
      />
      <View style={styles.panel} />
    </View>
  );
}

const styles = StyleSheet.create({
  fade: { position: "absolute", top: -24, left: 0, right: 0, height: 24 },
  panel: { ...StyleSheet.absoluteFill, backgroundColor: Palette.glass },
});
