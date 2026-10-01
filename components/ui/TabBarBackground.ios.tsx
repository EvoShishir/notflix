/**
 * Tab bar surface for iOS: a live system blur so artwork scrolling underneath
 * stays visible but never competes with the tab labels.
 */

import { BlurView } from "expo-blur";
import { StyleSheet } from "react-native";

export default function BlurTabBarBackground() {
  return (
    <BlurView
      tint="systemChromeMaterialDark"
      intensity={80}
      style={StyleSheet.absoluteFill}
    />
  );
}
