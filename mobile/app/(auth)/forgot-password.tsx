import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { requestPasswordReset } from "@/src/api/auth";
import { ApiError } from "@/src/api/client";
import { PrimaryButton, Screen } from "@/src/components/PrimaryButton";
import { colors } from "@/src/theme/colors";

const FROM_ADDRESS = "nightcap@cuqulabs.com";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ username?: string | string[] }>();
  const initialUsername = Array.isArray(params.username)
    ? params.username[0] ?? ""
    : params.username ?? "";
  const [username, setUsername] = useState(initialUsername);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    setLoading(true);
    try {
      const trimmedEmail = email.trim();
      const trimmedUsername = username.trim();
      await requestPasswordReset(
        trimmedEmail
          ? { email: trimmedEmail }
          : { username: trimmedUsername }
      );
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send the reset email");
    } finally {
      setLoading(false);
    }
  }

  const canSend = Boolean(email.trim() || username.trim());

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
            We’ll email a reset link from {FROM_ADDRESS}.
          </Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          <Text style={styles.label}>Username</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
            placeholder="yourname"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          {sent ? (
            <Text style={styles.sent}>
              If that account exists, a reset link is on its way from {FROM_ADDRESS}.
            </Text>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton
            title="Send reset link"
            onPress={() => void onSubmit()}
            loading={loading}
            disabled={!canSend || sent}
          />

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
  sent: {
    marginBottom: 16,
    fontSize: 15,
    color: colors.text,
  },
  error: {
    marginBottom: 16,
    fontSize: 15,
    color: colors.danger,
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
