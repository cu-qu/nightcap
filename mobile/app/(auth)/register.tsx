import { useRouter } from "expo-router";
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

import { ApiError } from "@/src/api/client";
import { PrimaryButton, Screen } from "@/src/components/PrimaryButton";
import { useAuthStore } from "@/src/store/authStore";
import { useCategoriesStore } from "@/src/store/categoriesStore";
import { colors } from "@/src/theme/colors";

export default function RegisterScreen() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);
  const loadCategories = useCategoriesStore((s) => s.load);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    setLoading(true);
    try {
      await register(
        username.trim(),
        email.trim(),
        password,
        inviteCode.trim() || undefined
      );
      await loadCategories();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not register");
    } finally {
      setLoading(false);
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
          <Text style={styles.brand}>Join NightCap</Text>
          <Text style={styles.subtitle}>
            Couple habit tracking. Invite your partner in the next step — or paste a code now.
          </Text>

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

          <Text style={styles.label}>Email</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.inputLast]}
          />

          <Pressable
            onPress={() => setShowInvite((v) => !v)}
            hitSlop={8}
            style={styles.inviteToggle}
          >
            <Text style={styles.footerLink}>
              {showInvite ? "Hide invite code" : "I have an invite code"}
            </Text>
          </Pressable>
          {showInvite ? (
            <>
              <Text style={styles.label}>Invite code</Text>
              <TextInput
                autoCapitalize="characters"
                autoCorrect={false}
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder="ABC123"
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.inputLast]}
              />
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton
            title="Create account"
            onPress={() => void onSubmit()}
            loading={loading}
            disabled={!username.trim() || !email.trim() || password.length < 8}
          />

          <View style={styles.footer}>
            <Text style={styles.footerMuted}>Already have an account? </Text>
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
  inputLast: {
    marginBottom: 24,
  },
  error: {
    marginBottom: 16,
    fontSize: 14,
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
  inviteToggle: {
    marginBottom: 16,
    alignSelf: "flex-start",
  },
});
