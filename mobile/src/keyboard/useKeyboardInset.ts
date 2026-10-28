import { useEffect, useState } from "react";
import { Keyboard, Platform, type KeyboardEvent } from "react-native";

import { keyboardOverlap } from "@/src/keyboard/keyboardOverlap";

/** Height of the keyboard still covering the window, or 0 when it is hidden. */
export function useKeyboardInset(enabled = true): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setInset(0);
      return;
    }
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (event: KeyboardEvent) => {
      setInset(keyboardOverlap(event));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setInset(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [enabled]);

  return inset;
}
