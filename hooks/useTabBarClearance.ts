import {
  Spacing,
  TAB_BAR_BOTTOM_PAD,
  TAB_BAR_HEIGHT,
} from "@/constants/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * How much room the floating tab bar takes at the bottom of the screen.
 *
 * The tab navigator sizes itself from these numbers and every tab screen pads
 * its scroll content by `clearance`, so a change to the bar's height can't leave
 * list content stranded underneath it.
 */
export function useTabBarClearance() {
  const insets = useSafeAreaInsets();

  /** Padding below the labels: the gesture/nav bar plus breathing room. */
  const bottomPad = insets.bottom + TAB_BAR_BOTTOM_PAD;

  return {
    bottomPad,
    /** Total height the bar occupies. */
    barHeight: TAB_BAR_HEIGHT + bottomPad,
    /** Bottom padding for scroll content, with a gap above the bar. */
    clearance: TAB_BAR_HEIGHT + bottomPad + Spacing.md,
  };
}
