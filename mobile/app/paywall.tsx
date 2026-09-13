import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton, Screen } from "@/src/components/PrimaryButton";
import {
  FALLBACK_PRICES,
  LEGAL_URLS,
  MONTHLY_PRODUCT_ID,
  YEARLY_PRODUCT_ID,
} from "@/src/iap/products";
import { useCoupleIap } from "@/src/iap/useCoupleIap";
import { useAuthStore } from "@/src/store/authStore";
import { colors } from "@/src/theme/colors";
import { confirmDeleteAccount } from "@/src/utils/deleteAccountPrompt";
import { membershipSummary } from "@/src/utils/needsPaywall";

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const [message, setMessage] = useState<string | null>(null);

  const iap = useCoupleIap({
    user,
    onEntitled: async () => {
      await refreshUser();
      const latest = useAuthStore.getState().user;
      if (latest?.membership?.is_active) {
        router.replace("/(tabs)");
      }
    },
    onError: (text) => setMessage(text),
  });

  const monthlyPrice = iap.prices[MONTHLY_PRODUCT_ID]?.displayPrice || FALLBACK_PRICES[MONTHLY_PRODUCT_ID];
  const yearlyPrice = iap.prices[YEARLY_PRODUCT_ID]?.displayPrice || FALLBACK_PRICES[YEARLY_PRODUCT_ID];
  const entitled = user?.membership?.is_active === true;

  async function onSubscribe(productId: string) {
    setMessage(null);
    await iap.subscribe(productId);
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
        ]}
      >
        <Text style={styles.eyebrow}>NightCap for two</Text>
        <Text style={styles.title}>One membership. Both of you.</Text>
        <Text style={styles.body}>
          Shared goals, recaps, and nightly check-ins for a couple. First month
          free, then {monthlyPrice} a month or {yearlyPrice} a year.
        </Text>
        <Text style={styles.summary}>{membershipSummary(user)}</Text>

        <Pressable
          onPress={() => void onSubscribe(YEARLY_PRODUCT_ID)}
          disabled={iap.busy || entitled}
          style={({ pressed }) => [
            styles.plan,
            styles.planFeatured,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.planEyebrow}>Best value</Text>
          <Text style={styles.planName}>Yearly</Text>
          <Text style={styles.planPrice}>{yearlyPrice} / year</Text>
          <Text style={styles.planSub}>One subscription covers both of you.</Text>
        </Pressable>

        <Pressable
          onPress={() => void onSubscribe(MONTHLY_PRODUCT_ID)}
          disabled={iap.busy || entitled}
          style={({ pressed }) => [styles.plan, pressed && styles.pressed]}
        >
          <Text style={styles.planName}>Monthly</Text>
          <Text style={styles.planPrice}>{monthlyPrice} / month</Text>
          <Text style={styles.planSub}>Cancel anytime in your store account.</Text>
        </Pressable>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <PrimaryButton
          title={iap.busy ? "Working…" : "Restore purchases"}
          variant="secondary"
          onPress={() => {
            setMessage(null);
            void iap.restore();
          }}
          loading={iap.busy}
        />
        <PrimaryButton
          title="Redeem Apple offer code"
          variant="ghost"
          onPress={() => {
            setMessage(null);
            void iap.redeemCode();
          }}
        />
        {entitled || user?.membership?.source === "store" ? (
          <PrimaryButton
            title="Manage subscription"
            variant="ghost"
            onPress={() => void iap.manage()}
          />
        ) : null}
        {entitled || user?.membership?.status === "trial" ? (
          <PrimaryButton
            title="Continue"
            variant="ghost"
            onPress={() => router.replace("/(tabs)")}
          />
        ) : null}

        <Text style={styles.legal}>
          Payment is charged to your Apple or Google account. Subscriptions renew
          automatically unless you turn off auto-renew at least 24 hours before
          the period ends. Unused trial time is forfeited when you buy.
        </Text>
        <View style={styles.links}>
          <Pressable onPress={() => void Linking.openURL(LEGAL_URLS.terms)}>
            <Text style={styles.link}>Terms</Text>
          </Pressable>
          <Text style={styles.dot}>·</Text>
          <Pressable onPress={() => void Linking.openURL(LEGAL_URLS.privacy)}>
            <Text style={styles.link}>Privacy</Text>
          </Pressable>
          <Text style={styles.dot}>·</Text>
          <Pressable onPress={() => void Linking.openURL(LEGAL_URLS.support)}>
            <Text style={styles.link}>Support</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => void logout()} hitSlop={8}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
        <Pressable onPress={() => confirmDeleteAccount(logout)} hitSlop={8}>
          <Text style={styles.deleteAccount}>Delete account</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    gap: 12,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.accentSoft,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.text,
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.muted,
  },
  summary: {
    marginBottom: 8,
    fontSize: 15,
    fontWeight: "600",
    color: colors.accentSoft,
  },
  plan: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 4,
  },
  planFeatured: {
    borderColor: colors.accent,
    backgroundColor: colors.elevated,
  },
  planEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: colors.accentSoft,
  },
  planName: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  planPrice: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  planSub: {
    fontSize: 14,
    color: colors.muted,
  },
  pressed: {
    opacity: 0.85,
  },
  message: {
    fontSize: 14,
    color: colors.danger,
  },
  legal: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
  },
  links: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  link: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.accentSoft,
  },
  dot: {
    color: colors.muted,
  },
  signOut: {
    marginTop: 16,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    color: colors.danger,
  },
  deleteAccount: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    color: colors.danger,
  },
});
