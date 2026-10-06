import { Dimensions, useWindowDimensions } from "react-native";

/**
 * Full physical screen height, system bars included, for the current
 * orientation.
 *
 * For a `Modal`'s backdrop. On Android, React Native lays a modal's content out
 * one navigation-bar height short of its window even with edge-to-edge on, so a
 * `flex: 1` backdrop stops above the gesture bar and a bottom sheet anchored to
 * it floats with the page showing, undimmed, underneath. Sizing to the screen
 * explicitly reaches the real bottom edge.
 *
 * Orientation comes from the window, which re-renders reliably on rotation;
 * the screen's own size is then read for that orientation. Relying on the
 * screen "change" event alone left the player's settings panel at its portrait
 * height after the landscape lock — taller than the screen, so its lower half
 * sat off-screen with nothing to scroll.
 */
export function useScreenHeight() {
  const { width, height } = useWindowDimensions();
  const screen = Dimensions.get("screen");
  const long = Math.max(screen.width, screen.height);
  const short = Math.min(screen.width, screen.height);
  return width > height ? short : long;
}
