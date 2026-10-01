import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Tabs } from "expo-router";
import React, { useEffect } from "react";
import { ColorValue, Platform, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useMotionEnabled } from "@/components/ui/Motion";
import TabBarBackground from "@/components/ui/TabBarBackground";
import {
  Duration,
  FontFamily,
  FontSize,
  IconSize,
  Palette,
  Radius,
  Spacing,
  Springs,
} from "@/constants/theme";
import { useTabBarClearance } from "@/hooks/useTabBarClearance";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/**
 * Tab icon that lifts and lights up when selected.
 *
 * The glow pill sits behind the glyph and only scales — it never changes the
 * icon's layout bounds, so selecting a tab can't nudge its neighbours.
 */
function TabIcon({
  focused,
  color,
  name,
}: {
  focused: boolean;
  // `ColorValue`, not `string`: react-navigation 7 can hand back a platform
  // colour object as well as a hex string.
  color: ColorValue;
  name: IconName;
}) {
  const motion = useMotionEnabled();
  const active = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    active.value = motion
      ? withSpring(focused ? 1 : 0, Springs.bouncy)
      : withTiming(focused ? 1 : 0, { duration: 0 });
  }, [focused, motion, active]);

  const glyphStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + active.value * 0.1 },
      { translateY: -active.value * 2 },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [{ scale: 0.7 + active.value * 0.3 }],
  }));

  return (
    <View style={styles.iconWrap}>
      <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none" />
      <Animated.View style={glyphStyle}>
        <Ionicons name={name} size={IconSize.lg} color={color} />
      </Animated.View>
    </View>
  );
}

export default function TabLayout() {
  // Reserves the gesture/nav bar plus extra breathing room beneath the labels.
  const { barHeight, bottomPad } = useTabBarClearance();

  return (
    <Tabs
      /**
       * Haptics live on the navigator's own press event rather than a custom
       * `tabBarButton`.
       *
       * expo-router 57 ships its own bottom-tabs types whose button props are a
       * separate declaration from react-navigation's, so a custom button
       * component cannot satisfy both. A listener needs no component, applies to
       * every tab from one place, and can't drift out of sync with the types.
       */
      screenListeners={{
        tabPress: () => {
          if (Platform.OS !== "web") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
              () => {}
            );
          }
        },
      }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Palette.foreground,
        tabBarInactiveTintColor: Palette.mutedForeground,
        tabBarBackground: TabBarBackground,
        // Float the bar over content; every screen adds matching bottom inset.
        tabBarStyle: {
          position: "absolute",
          height: barHeight,
          paddingTop: Spacing.xs,
          paddingBottom: bottomPad,
          backgroundColor: "transparent",
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: Palette.border,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontFamily: FontFamily.medium,
          fontSize: FontSize.caption,
          marginTop: Spacing.xxs,
        },
        tabBarItemStyle: { paddingVertical: Spacing.xxs },
        // Cross-fade between tabs instead of an instant swap.
        //
        // No custom `easing` here: React Navigation drives this with RN's
        // Animated, which needs a plain function, while our `Easings` tokens are
        // Reanimated easing factories ({ factory }) understood only by worklets.
        animation: "fade",
        transitionSpec: {
          animation: "timing",
          config: { duration: Duration.fast },
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              focused={focused}
              color={color}
              name={focused ? "home" : "home-outline"}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Search",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              focused={focused}
              color={color}
              name={focused ? "search" : "search-outline"}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: "Downloads",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              focused={focused}
              color={color}
              name={focused ? "download" : "download-outline"}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="categories"
        options={{
          title: "Categories",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              focused={focused}
              color={color}
              name={focused ? "grid" : "grid-outline"}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 48,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    width: 48,
    height: 30,
    borderRadius: Radius.pill,
    backgroundColor: Palette.accentSoft,
    ...Platform.select({
      ios: {
        shadowColor: Palette.accent,
        shadowOpacity: 0.6,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 0 },
      },
      default: {},
    }),
  },
});
