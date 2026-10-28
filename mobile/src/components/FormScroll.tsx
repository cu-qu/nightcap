import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from "react";
import {
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
  View,
  type KeyboardEvent,
  type ScrollViewProps,
  type TextInputProps,
} from "react-native";

import { focusedFieldScrollDelta, FIELD_KEYBOARD_GAP } from "@/src/keyboard/focusedField";
import { keyboardOverlap } from "@/src/keyboard/keyboardOverlap";

const RevealContext = createContext<() => void>(() => {});

function useRevealFocusedField(): () => void {
  return useContext(RevealContext);
}

type Measurable = {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void
  ) => void;
};

function isMeasurable(value: unknown): value is Measurable {
  return (
    !!value &&
    typeof value === "object" &&
    "measureInWindow" in value &&
    typeof (value as Measurable).measureInWindow === "function"
  );
}

type FormScrollProps = ScrollViewProps & {
  children?: ReactNode;
};

/**
 * Scrolls the focused text field above the keyboard, including while a
 * multiline field grows, and leaves room to scroll the last field clear.
 */
export function FormScroll({
  children,
  contentContainerStyle,
  keyboardShouldPersistTaps = "handled",
  onScroll,
  scrollEventThrottle = 16,
  ...props
}: FormScrollProps) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollY = useRef(0);
  const keyboardHeight = useRef(0);
  const revealId = useRef(0);
  const [spacer, setSpacer] = useState(0);

  const reveal = useCallback(() => {
    const id = ++revealId.current;
    setTimeout(() => {
      if (id !== revealId.current) return;
      const input = TextInput.State.currentlyFocusedInput();
      const scroll = scrollRef.current;
      if (!scroll || !isMeasurable(input)) return;
      input.measureInWindow((_x, y, _width, height) => {
        if (id !== revealId.current) return;
        const delta = focusedFieldScrollDelta({
          top: y,
          height,
          windowHeight: Dimensions.get("window").height,
          keyboardOverlap: keyboardHeight.current,
        });
        if (delta <= 0) return;
        scroll.scrollTo({
          y: scrollY.current + delta,
          animated: true,
        });
      });
    }, 60);
  }, []);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (event: KeyboardEvent) => {
      const height = keyboardOverlap(event);
      keyboardHeight.current = height;
      setSpacer(height > 0 ? height + FIELD_KEYBOARD_GAP : 0);
      if (height > 0 || Platform.OS === "android") reveal();
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardHeight.current = 0;
      setSpacer(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [reveal]);

  return (
    <RevealContext.Provider value={reveal}>
      <ScrollView
        {...props}
        ref={scrollRef}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        contentContainerStyle={contentContainerStyle}
        scrollEventThrottle={scrollEventThrottle}
        onScroll={(event) => {
          scrollY.current = event.nativeEvent.contentOffset.y;
          onScroll?.(event);
        }}
      >
        {children}
        {spacer > 0 ? (
          <View style={{ height: spacer }} onLayout={reveal} />
        ) : null}
      </ScrollView>
    </RevealContext.Provider>
  );
}

/** Text field that asks the surrounding form to stay above the keyboard. */
export const FieldInput = forwardRef<ComponentRef<typeof TextInput>, TextInputProps>(
  function FieldInput({ onFocus, onContentSizeChange, multiline, ...props }, ref) {
    const reveal = useRevealFocusedField();
    return (
      <TextInput
        ref={ref}
        multiline={multiline}
        {...props}
        onFocus={(event) => {
          onFocus?.(event);
          reveal();
        }}
        onContentSizeChange={(event) => {
          onContentSizeChange?.(event);
          if (multiline) reveal();
        }}
      />
    );
  }
);
