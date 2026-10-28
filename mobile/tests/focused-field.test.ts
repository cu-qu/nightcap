import { focusedFieldScrollDelta } from "@/src/keyboard/focusedField";

describe("focusedFieldScrollDelta", () => {
  it("scrolls a covered field clear of the keyboard", () => {
    expect(
      focusedFieldScrollDelta({
        top: 620,
        height: 140,
        windowHeight: 800,
        keyboardOverlap: 320,
        gap: 28,
      })
    ).toBe(308);
  });

  it("stays put when the field is already above the keyboard", () => {
    expect(
      focusedFieldScrollDelta({
        top: 120,
        height: 48,
        windowHeight: 800,
        keyboardOverlap: 320,
        gap: 28,
      })
    ).toBe(0);
  });

  it("nudges a field that sits on the resized window edge", () => {
    expect(
      focusedFieldScrollDelta({
        top: 740,
        height: 48,
        windowHeight: 800,
        keyboardOverlap: 0,
        gap: 28,
      })
    ).toBe(16);
  });
});
