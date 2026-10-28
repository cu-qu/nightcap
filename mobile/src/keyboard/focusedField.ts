/** Space left between the focused field and the top of the keyboard. */
export const FIELD_KEYBOARD_GAP = 28;

/**
 * How far to scroll so the bottom of the focused field sits above the keyboard.
 * Zero when the field is already fully visible.
 */
export function focusedFieldScrollDelta(input: {
  top: number;
  height: number;
  windowHeight: number;
  keyboardOverlap: number;
  gap?: number;
}): number {
  const gap = input.gap ?? FIELD_KEYBOARD_GAP;
  const visibleBottom = input.windowHeight - input.keyboardOverlap - gap;
  return Math.max(0, input.top + input.height - visibleBottom);
}
