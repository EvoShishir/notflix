import { useEffect, useState } from "react";
import { Dimensions } from "react-native";

/**
 * Full physical screen height, system bars included.
 *
 * For a `Modal`'s backdrop. On Android, React Native lays a modal's content out
 * one navigation-bar height short of its window even with edge-to-edge on, so a
 * `flex: 1` backdrop stops above the gesture bar and a bottom sheet anchored to
 * it floats with the page showing, undimmed, underneath. Sizing to the screen
 * explicitly reaches the real bottom edge.
 *
 * `Dimensions` rather than `useWindowDimensions`, which reports the same short
 * window height. Tracks rotation, since the player opens its panel in landscape.
 */
export function useScreenHeight() {
  const [height, setHeight] = useState(() => Dimensions.get("screen").height);

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ screen }) =>
      setHeight(screen.height)
    );
    return () => sub.remove();
  }, []);

  return height;
}
