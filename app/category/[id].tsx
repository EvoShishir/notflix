import { AppText } from "@/components/ui/AppText";
import { useMotion } from "@/components/ui/Motion";
import { PressableScale } from "@/components/ui/PressableScale";
import {
  LargeTitle,
  StickyHeaderBar,
  useStickyHeaderHeight,
} from "@/components/ui/ScreenHeader";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/StateViews";
import {
  gutterFor,
  IconSize,
  Palette,
  Radius,
  Spacing,
  TouchTarget,
} from "@/constants/theme";
import { apiService } from "@/services/api";
import { CategoryAPIItem } from "@/types";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ROW_HEIGHT = TouchTarget + Spacing.lg;

export default function CategoryDetailScreen() {
  const { id, name, hasSubCategories } = useLocalSearchParams<{
    id: string;
    name: string;
    hasSubCategories: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { enter } = useMotion();
  const headerHeight = useStickyHeaderHeight();
  const gutter = gutterFor(width);
  const scrollY = useSharedValue(0);

  const isLeaf = hasSubCategories !== "true";

  const [subCategories, setSubCategories] = useState<CategoryAPIItem[]>([]);
  const [loading, setLoading] = useState(!isLeaf);
  const [error, setError] = useState<string | null>(null);

  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const fetchSubCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const all = await apiService.fetchCategories();
      const parent = all.find((cat) => cat.id.toString() === id);
      setSubCategories(parent?.subCategory ?? []);
    } catch {
      setError("We couldn't load this category's sections.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  /**
   * One effect, always run in the same order — a leaf category has no sections
   * to show, so it forwards straight to the content screen instead of rendering
   * an empty list. (Previously this branch called `useEffect` after an early
   * return, which changed hook order between renders.)
   */
  useEffect(() => {
    if (isLeaf) {
      router.replace({
        pathname: "/category-content/[id]",
        params: { id, name },
      });
      return;
    }
    fetchSubCategories();
  }, [isLeaf, id, name, router, fetchSubCategories]);

  const handlePress = useCallback(
    (sub: CategoryAPIItem) => {
      router.push({
        pathname: "/category-content/[id]",
        params: { id: sub.id.toString(), name: sub.name },
      });
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: CategoryAPIItem; index: number }) => (
      <Animated.View entering={enter.rise(index, 45)}>
        <PressableScale
          onPress={() => handlePress(item)}
          accessibilityRole="button"
          accessibilityLabel={item.name}
          accessibilityHint="Opens titles in this section"
          scaleTo={0.985}
          style={styles.row}
        >
          <AppText variant="body" numberOfLines={2} style={styles.rowLabel}>
            {item.name}
          </AppText>
          <Ionicons
            name="chevron-forward"
            size={IconSize.md}
            color={Palette.mutedForeground}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </PressableScale>
      </Animated.View>
    ),
    [enter, handlePress]
  );

  if (isLeaf || loading) {
    return (
      <View style={styles.container}>
        <StickyHeaderBar title={name ?? "Category"} scrollY={scrollY} />
        <SkeletonGroup label="Loading sections">
          <View style={{ paddingHorizontal: gutter, paddingTop: headerHeight + Spacing.md }}>
            <Skeleton width={220} height={30} />
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton
                key={i}
                height={ROW_HEIGHT}
                radius={Radius.lg}
                style={{ marginTop: Spacing.xs }}
              />
            ))}
          </View>
        </SkeletonGroup>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <StickyHeaderBar title={name ?? "Category"} scrollY={scrollY} />
        <View style={styles.centered}>
          <ErrorState
            title="Couldn't open this category"
            message={error}
            onRetry={fetchSubCategories}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StickyHeaderBar title={name ?? "Category"} scrollY={scrollY} />

      <Animated.FlatList
        data={subCategories}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <LargeTitle
            eyebrow="Category"
            title={name ?? "Category"}
            subtitle={`${subCategories.length} section${
              subCategories.length === 1 ? "" : "s"
            }`}
            offset={headerHeight}
            style={styles.title}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="folder-open-outline"
            title="No sections here"
            message="This category has no sub-sections to browse."
          />
        }
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingBottom: insets.bottom + Spacing.xxl,
        }}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={9}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.background },
  centered: { flex: 1, justifyContent: "center" },
  title: { paddingHorizontal: 0 },
  row: {
    minHeight: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xs,
    borderRadius: Radius.lg,
    backgroundColor: Palette.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
  rowLabel: { flex: 1 },
});
