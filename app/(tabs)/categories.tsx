import { AppText } from "@/components/ui/AppText";
import { useMotion } from "@/components/ui/Motion";
import { PressableScale } from "@/components/ui/PressableScale";
import { LargeTitle } from "@/components/ui/ScreenHeader";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/StateViews";
import {
  gutterFor,
  IconSize,
  Palette,
  Radius,
  Shadows,
  Spacing,
} from "@/constants/theme";
import { useTabBarClearance } from "@/hooks/useTabBarClearance";
import { apiService } from "@/services/api";
import { CategoryAPIItem } from "@/types";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TILE_HEIGHT = 112;

/**
 * Tile gradients.
 *
 * Picked deterministically from the category id so a given category always looks
 * the same between launches, and the grid reads as varied rather than random.
 * Color is decoration only — the name and count carry all the meaning.
 */
const TILE_GRADIENTS = [
  ["#1E1B4B", "#0C0C0D"],
  ["#3B0764", "#0C0C0D"],
  ["#0F2A4A", "#0C0C0D"],
  ["#4C1D24", "#0C0C0D"],
  ["#123B33", "#0C0C0D"],
  ["#3A2A0B", "#0C0C0D"],
] as const;

function columnsFor(width: number) {
  if (width >= 1200) return 5;
  if (width >= 900) return 4;
  if (width >= 600) return 3;
  return 2;
}

function CategoryTile({
  item,
  index,
  width,
  onPress,
}: {
  item: CategoryAPIItem;
  index: number;
  width: number;
  onPress: () => void;
}) {
  const { enter } = useMotion();
  const subCount = item.subCategory?.length ?? 0;
  const gradient = TILE_GRADIENTS[item.id % TILE_GRADIENTS.length];

  return (
    <Animated.View entering={enter.rise(index, 50)}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          subCount > 0
            ? `${item.name}, ${subCount} sub-categories`
            : item.name
        }
        accessibilityHint={
          subCount > 0 ? "Opens sub-categories" : "Opens titles in this category"
        }
        style={[styles.tile, { width }, Shadows.card]}
      >
        <LinearGradient
          colors={gradient}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.tileBody}>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {item.name}
          </AppText>

          <View style={styles.tileFooter}>
            {subCount > 0 ? (
              <AppText variant="caption" tone="muted">
                {subCount} sub-categor{subCount === 1 ? "y" : "ies"}
              </AppText>
            ) : (
              <AppText variant="caption" tone="muted">
                Browse titles
              </AppText>
            )}
            <Ionicons
              name="arrow-forward"
              size={IconSize.sm}
              color={Palette.accent}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

export default function CategoriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { clearance } = useTabBarClearance();

  const [categories, setCategories] = useState<CategoryAPIItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const columns = columnsFor(width);
  const gutter = gutterFor(width);
  const tileWidth = Math.floor(
    (width - gutter * 2 - Spacing.sm * (columns - 1)) / columns
  );

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setCategories(await apiService.fetchCategories());
    } catch {
      setError("We couldn't load the category list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handlePress = useCallback(
    (category: CategoryAPIItem) => {
      const hasSubs = (category.subCategory?.length ?? 0) > 0;
      router.push({
        pathname: hasSubs ? "/category/[id]" : "/category-content/[id]",
        params: {
          id: category.id.toString(),
          name: category.name,
          ...(hasSubs ? { hasSubCategories: "true" } : {}),
        },
      });
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: CategoryAPIItem; index: number }) => (
      <View
        style={{ marginRight: (index + 1) % columns === 0 ? 0 : Spacing.sm }}
      >
        <CategoryTile
          item={item}
          index={index}
          width={tileWidth}
          onPress={() => handlePress(item)}
        />
      </View>
    ),
    [columns, tileWidth, handlePress]
  );

  const header = useMemo(
    () => (
      <LargeTitle
        eyebrow="Browse"
        title="Categories"
        subtitle="Every collection, in one place"
        offset={insets.top}
        style={styles.header}
      />
    ),
    [insets.top]
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <SkeletonGroup label="Loading categories">
          <View style={{ paddingHorizontal: gutter, paddingTop: insets.top + Spacing.lg }}>
            <Skeleton width={200} height={30} />
            <View style={styles.skeletonGrid}>
              {Array.from({ length: columns * 4 }).map((_, i) => (
                <Skeleton
                  key={i}
                  width={tileWidth}
                  height={TILE_HEIGHT}
                  radius={Radius.xl}
                  style={{
                    marginRight: (i + 1) % columns === 0 ? 0 : Spacing.sm,
                    marginBottom: Spacing.sm,
                  }}
                />
              ))}
            </View>
          </View>
        </SkeletonGroup>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ErrorState
          title="Categories unavailable"
          message={error}
          onRetry={fetchCategories}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.FlatList
        key={`cats-${columns}`}
        data={categories}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        numColumns={columns}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            icon="albums-outline"
            title="No categories yet"
            message="Once content is published it will show up here."
            actionLabel="Refresh"
            onAction={fetchCategories}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingBottom: clearance,
        }}
        columnWrapperStyle={columns > 1 ? styles.row : undefined}
        initialNumToRender={columns * 4}
        maxToRenderPerBatch={columns * 3}
        windowSize={9}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.background },
  centered: { justifyContent: "center" },
  header: { paddingHorizontal: 0 },
  row: { justifyContent: "flex-start", marginBottom: Spacing.sm },
  tile: {
    height: TILE_HEIGHT,
    borderRadius: Radius.xl,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
  tileBody: {
    flex: 1,
    padding: Spacing.sm,
    justifyContent: "space-between",
  },
  tileFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.xxs,
  },
  skeletonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: Spacing.lg,
  },
});
