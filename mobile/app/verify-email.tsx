import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { resendVerificationEmail } from "@/src/api/auth";
import { ApiError } from "@/src/api/client";
import { PrimaryButton, Screen } from "@/src/components/PrimaryButton";
import { useAuthStore } from "@/src/store/authStore";
import { colors } from "@/src/theme/colors";
import { confirmDeleteAccount } from "@/src/utils/deleteAccountPrompt";
import { needsEmailVerification } from "@/src/utils/needsEmailVerification";
import { needsOnboarding } from "@/src/utils/needsOnboarding";
import { needsPaywall } from "@/src/utils/needsPaywall";

const FROM_ADDRESS = "nightcap@cuqulabs.com";

export default function VerifyEmailScreen() {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const logout = useAuthStore((s) => s.logout);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!isAuthenticated) {
      router.replace("/(auth)/login");
      return;
    }
    if (!needsEmailVerification(user)) {
      if (needsOnboarding(user)) router.replace("/(onboarding)");
      else if (needsPaywall(user)) router.replace("/paywall");
      else router.replace("/(tabs)");
    }
  }, [hydrated, isAuthenticated, router, user]);

  useEffect(() => {
    if (!isAuthenticated || !needsEmailVerification(user)) return;
    const id = setInterval(() => {
      void refreshUser().catch(() => undefined);
    }, 4000);
    return () => clearInterval(id);
  }, [isAuthenticated, refreshUser, user]);

  async function onResend() {
    setError(null);
    setNotice(null);
    setSending(true);
    try {
      await resendVerificationEmail();
      setNotice(`A new link is on its way from ${FROM_ADDRESS}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send the email. Try again.");
    } finally {
      setSending(false);
    }
  }

  async function onCheck() {
    setError(null);
    setChecking(true);
    try {
      await refreshUser();
      const latest = useAuthStore.getState().user;
      if (needsEmailVerification(latest)) {
        setNotice(null);
        setError("That email is not confirmed yet.");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not check your account. Try again.");
    } finally {
      setChecking(false);
    }
  }

  async function onSignOut() {
    await logout();
    router.replace("/(auth)/login");
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>NightCap</Text>
        <Text style={styles.title}>Confirm your email</Text>
        <Text style={styles.subtitle}>
          We sent a confirmation link to {user?.email || "your email"} from {FROM_ADDRESS}.
          Open it, then come back here. NightCap stays locked until that link is confirmed.
        </Text>

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <PrimaryButton
          title="Resend email"
          onPress={() => void onResend()}
          loading={sending}
        />
        <View style={styles.gap} />
        <PrimaryButton
          title="I've confirmed"
          variant="secondary"
          onPress={() => void onCheck()}
          loading={checking}
        />

        <View style={styles.footer}>
          <Pressable hitSlop={8} onPress={() => void onSignOut()}>
            <Text style={styles.footerLink}>Sign out</Text>
          </Pressable>
          <Pressable hitSlop={8} onPress={() => confirmDeleteAccount(logout)}>
            <Text style={styles.footerDanger}>Delete account</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  title: {
    marginBottom: 12,
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    marginBottom: 28,
    fontSize: 16,
    lineHeight: 24,
    color: colors.muted,
  },
  notice: {
    marginBottom: 16,
    fontSize: 15,
    color: colors.text,
  },
  error: {
    marginBottom: 16,
    fontSize: 15,
    color: colors.danger,
  },
  gap: {
    height: 12,
  },
  footer: {
    marginTop: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerLink: {
    fontWeight: "600",
    color: colors.accentSoft,
  },
  footerDanger: {
    fontWeight: "600",
    color: colors.danger,
  },
});
