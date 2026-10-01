import {
  gutterFor,
  IconSize,
  Palette,
  POSTER_ASPECT,
  Spacing,
  TouchTarget,
} from "@/constants/theme";
import { Category } from "@/types";
import Ionicons from "@expo/vector-icons/Ionicons";
import React, { memo, useCallback, useMemo } from "react";
import { FlatList, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated from "react-native-reanimated";
import OptimizedVideoCard from "./OptimizedVideoCard";
import { AppText } from "./ui/AppText";
import { useMotion } from "./ui/Motion";
import { PressableScale } from "./ui/PressableScale";

interface CategoryRowProps {
  category: Category;
  onVideoPress: (videoId: string) => void;
  onSeeAllPress?: () => void;
  /** Row position on the page — drives the staggered entrance. */
  index?: number;
}

/**
 * Poster card size, derived from the viewport so roughly 2.6 cards peek on a
 * phone and more on a tablet. The partial card at the right edge is the cue that
 * the shelf scrolls.
 */
export function useCardSize() {
  const { width } = useWindowDimensions();
  return useMemo(() => {
    const gutter = gutterFor(width);
    const perScreen = width >= 1024 ? 6.4 : width >= 768 ? 4.4 : 2.6;
    const cardWidth = Math.round((width - gutter * 2) / perScreen);
    return {
      gutter,
      cardWidth,
      cardHeight: Math.round(cardWidth / POSTER_ASPECT),
    };
  }, [width]);
}

const OptimizedCategoryRow = memo(function CategoryRow({
  category,
  onVideoPress,
  onSeeAllPress,
  index = 0,
}: CategoryRowProps) {
  const { enter } = useMotion();
  const { gutter, cardWidth, cardHeight } = useCardSize();
  const stride = cardWidth + Spacing.sm;

  // `onVideoPress` is passed through unwrapped so its identity is stable across
  // renders; the card calls it with the id itself. Wrapping it in an arrow here
  // would give every cell a new callback each render and undo the card's `memo`.
  const renderVideoItem = useCallback(
    ({ item }: { item: Category["videos"][number] }) => (
      <OptimizedVideoCard
        video={item}
        width={cardWidth}
        height={cardHeight}
        onPress={onVideoPress}
      />
    ),
    [cardWidth, cardHeight, onVideoPress]
  );

  if (!category.videos?.length) return null;

  return (
    <Animated.View entering={enter.rise(index, 70)} style={styles.container}>
      <View style={[styles.header, { paddingHorizontal: gutter }]}>
        <AppText variant="title" accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {category.name}
        </AppText>

        {onSeeAllPress && (
          <PressableScale
            onPress={onSeeAllPress}
            accessibilityRole="button"
            // Names the destination — "See all" alone is meaningless out of context.
            accessibilityLabel={`See all in ${category.name}`}
            style={styles.seeAll}
          >
            <AppText variant="micro" tone="accent">
              See all
            </AppText>
            <Ionicons
              name="chevron-forward"
              size={IconSize.sm}
              color={Palette.accent}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </PressableScale>
        )}
      </View>

      <FlatList
        data={category.videos}
        renderItem={renderVideoItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: gutter,
          gap: Spacing.sm,
        }}
        // Snapping to the card stride makes the shelf settle on a poster edge
        // instead of stopping mid-card.
        snapToInterval={stride}
        decelerationRate="fast"
        snapToAlignment="start"
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        // Deliberately off for the shelves: on Android, clipping subviews of a
        // horizontal list nested in a vertical one is a known source of blank
        // cells and stutter, and a shelf is short enough not to need it.
        removeClippedSubviews={false}
        getItemLayout={(_, i) => ({
          length: stride,
          offset: stride * i,
          index: i,
        })}
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.lg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  title: { flex: 1 },
  seeAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    // Text-sized label, platform-sized hit area.
    minHeight: TouchTarget,
    paddingLeft: Spacing.sm,
  },
});

export default OptimizedCategoryRow;
