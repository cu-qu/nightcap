import { Dimensions, Platform, type KeyboardEvent } from "react-native";

/** How much of the keyboard still covers this window. Zero when the window already resized. */
export function keyboardOverlap(event: KeyboardEvent): number {
  const screenY = event.endCoordinates?.screenY ?? 0;
  const height = event.endCoordinates?.height ?? 0;
  if (screenY > 0) {
    return Math.max(0, Dimensions.get("window").height - screenY);
  }
  return Platform.OS === "ios" ? height : 0;
}
