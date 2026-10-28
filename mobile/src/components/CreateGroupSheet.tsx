import { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/src/components/PrimaryButton";
import { colors } from "@/src/theme/colors";

type Props = {
  visible: boolean;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
};

/** How much of the keyboard still covers this window. Zero when the window already resized. */
export function keyboardOverlap(event: KeyboardEvent): number {
  const screenY = event.endCoordinates?.screenY ?? 0;
  const height = event.endCoordinates?.height ?? 0;
  if (screenY > 0) {
    return Math.max(0, Dimensions.get("window").height - screenY);
  }
  return Platform.OS === "ios" ? height : 0;
}

export function CreateGroupSheet({
  visible,
  loading,
  onClose,
  onSubmit,
}: Props) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [name, setName] = useState("");
  const [keyboardInset, setKeyboardInset] = useState(0);
  const trimmed = name.trim();

  useEffect(() => {
    if (!visible) {
      setKeyboardInset(0);
      return;
    }
    setName("");
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 250);
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardInset(keyboardOverlap(event));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardInset(0));
    return () => {
      clearTimeout(focusTimer);
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  async function submit() {
    if (!trimmed || loading) return;
    await onSubmit(trimmed);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingBottom: keyboardInset }]}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel="Close new group"
        />
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: keyboardInset > 0 ? 12 : Math.max(insets.bottom, 16),
            },
          ]}
        >
          <Text style={styles.title}>New group</Text>
          <Text style={styles.subtitle}>
            Name the group. You can change its emoji after it's created.
          </Text>
          <TextInput
            ref={inputRef}
            value={name}
            onChangeText={setName}
            placeholder="Group name"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
          />
          <PrimaryButton
            title="Create group"
            loading={loading}
            disabled={!trimmed}
            onPress={() => void submit()}
          />
          <Pressable onPress={onClose} style={styles.cancel} hitSlop={8}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 16,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  input: {
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  cancel: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.accentSoft,
  },
});
