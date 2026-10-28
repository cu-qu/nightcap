import { Dimensions, Platform } from "react-native";

import { keyboardOverlap } from "@/src/components/CreateGroupSheet";

describe("keyboardOverlap", () => {
  const height = Dimensions.get("window").height;

  it("lifts the sheet by the uncovered keyboard height", () => {
    expect(
      keyboardOverlap({
        endCoordinates: { screenY: height - 320, height: 320 },
      } as never)
    ).toBe(320);
  });

  it("stays put when the window already ends at the keyboard", () => {
    expect(
      keyboardOverlap({
        endCoordinates: { screenY: height, height: 320 },
      } as never)
    ).toBe(0);
  });

  it("uses the reported height on iOS when screen position is missing", () => {
    const previous = Platform.OS;
    Platform.OS = "ios";
    expect(
      keyboardOverlap({
        endCoordinates: { screenY: 0, height: 280 },
      } as never)
    ).toBe(280);
    Platform.OS = previous;
  });
});
