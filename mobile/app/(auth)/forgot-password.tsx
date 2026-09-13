import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { PrimaryButton, Screen } from "@/src/components/PrimaryButton";
import { colors } from "@/src/theme/colors";

const SUPPORT_EMAIL = "night_cap_app@proton.me";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ username?: string | string[] }>();
  const initialUsername = Array.isArray(params.username)
    ? params.username[0] ?? ""
    : params.username ?? "";
  const [username, setUsername] = useState(initialUsername);

  async function openMail() {
    const subject = "NightCap password reset";
    const body = [
      "Hi,",
      "",
      "I forgot my NightCap password.",
      username.trim() ? `Username: ${username.trim()}` : "Username: ",
      "",
      "Thanks.",
    ].join("\n");
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        "Email us",
        `Send a note to ${SUPPORT_EMAIL} with your username and we’ll reset your password.`
      );
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.brand}>Forgot password</Text>
          <Text style={styles.subtitle}>
            Email us from the address on your account, include your username, and
            we’ll reset it for you.
          </Text>

          <Text style={styles.label}>Username (optional)</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
            placeholder="yourname"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          <Text style={styles.label}>Send to</Text>
          <Text selectable style={styles.email}>
            {SUPPORT_EMAIL}
          </Text>

          <PrimaryButton title="Open email" onPress={() => void openMail()} />

          <View style={styles.footer}>
            <Text style={styles.footerMuted}>Remembered it? </Text>
            <Pressable hitSlop={8} onPress={() => router.push("/(auth)/login")}>
              <Text style={styles.footerLink}>Sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  brand: {
    marginBottom: 8,
    fontSize: 36,
    fontWeight: "700",
    color: colors.accentSoft,
  },
  subtitle: {
    marginBottom: 40,
    fontSize: 16,
    color: colors.muted,
  },
  label: {
    marginBottom: 8,
    fontSize: 14,
    color: colors.muted,
  },
  input: {
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: colors.text,
  },
  email: {
    marginBottom: 24,
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  footer: {
    marginTop: 24,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerMuted: {
    color: colors.muted,
  },
  footerLink: {
    fontWeight: "600",
    color: colors.accentSoft,
  },
});
