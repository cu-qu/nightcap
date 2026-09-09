import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getApiBaseUrl } from "@/src/api/client";
import { ensurePartnership, invitePartner } from "@/src/api/partnership";
import { PrimaryButton, Screen } from "@/src/components/PrimaryButton";
import { useAuthStore } from "@/src/store/authStore";
import { colors } from "@/src/theme/colors";

export default function SettingsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const partnership = user?.partnership;
  const other = partnership?.members.find((m) => m.username !== user?.username);

  const [email, setEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refreshUser();
    }, [refreshUser])
  );

  async function onCreateCouple() {
    setInviteBusy(true);
    setInviteMessage(null);
    try {
      await ensurePartnership();
      await refreshUser();
    } catch (e) {
      setInviteMessage(e instanceof Error ? e.message : "Could not start a couple space");
    } finally {
      setInviteBusy(false);
    }
  }

  async function onSendInvite() {
    if (!email.trim()) return;
    setInviteBusy(true);
    setInviteMessage(null);
    try {
      const result = await invitePartner(email.trim());
      await refreshUser();
      setInviteMessage(
        result.email_sent
          ? `Invite sent to ${email.trim()}`
          : "Code is ready — email could not send, share it instead."
      );
      setEmail("");
    } catch (e) {
      setInviteMessage(e instanceof Error ? e.message : "Could not send invite");
    } finally {
      setInviteBusy(false);
    }
  }

  async function onShareCode() {
    const code = partnership?.invite_code;
    if (!code) return;
    try {
      await Share.share({
        message: `Join me on NightCap — couple habit tracking. Invite code: ${code}`,
      });
    } catch {
      // cancelled
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.muted}>Signed in as</Text>
        <Text style={styles.username}>{user?.username ?? "—"}</Text>
        <Text style={styles.api}>API: {getApiBaseUrl()}</Text>

        <View style={styles.partnerCard}>
          <Text style={styles.partnerEyebrow}>Your person</Text>
          {other ? (
            <>
              <Text style={styles.partnerName}>{other.username}</Text>
              <Text style={styles.partnerSub}>
                Shared goals count both of you. Personal goals stay private.
              </Text>
            </>
          ) : partnership ? (
            <>
              <Text style={styles.partnerName}>Waiting on a partner</Text>
              <Text style={styles.code}>{partnership.invite_code}</Text>
              <Text style={styles.partnerSub}>
                Share this code. They enter it when they create an account.
              </Text>
              <PrimaryButton
                title="Share invite code"
                variant="secondary"
                onPress={() => void onShareCode()}
              />
              <Text style={styles.emailLabel}>Email invite</Text>
              <TextInput
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                placeholder="partner@email.com"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
              <PrimaryButton
                title="Send invite"
                onPress={() => void onSendInvite()}
                loading={inviteBusy}
                disabled={!email.trim()}
              />
            </>
          ) : (
            <>
              <Text style={styles.partnerName}>Using NightCap alone</Text>
              <Text style={styles.partnerSub}>
                Invite a partner to share grocery budgets, date nights, and couple
                habits — personal goals stay just yours.
              </Text>
              <PrimaryButton
                title="Invite a partner"
                onPress={() => void onCreateCouple()}
                loading={inviteBusy}
              />
            </>
          )}
          {inviteMessage ? (
            <Text style={styles.inviteMessage}>{inviteMessage}</Text>
          ) : null}
        </View>

        <Pressable
          style={styles.linkRow}
          onPress={() => router.push("/(tabs)/categories-groups")}
          hitSlop={6}
        >
          <View style={styles.flex}>
            <Text style={styles.linkTitle}>Categories & Groups</Text>
            <Text style={styles.linkSub}>
              Configure Spend, custom groups, and ungrouped categories
            </Text>
          </View>
          <Text style={styles.linkChevron}>›</Text>
        </Pressable>

        <Pressable
          style={styles.linkRow}
          onPress={() => router.push("/(tabs)/goals")}
          hitSlop={6}
        >
          <Text style={styles.linkTitle}>Goals</Text>
          <Text style={styles.linkChevron}>›</Text>
        </Pressable>

        <View style={styles.signOut}>
          <PrimaryButton
            title="Sign out"
            variant="secondary"
            onPress={() => void logout()}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 48,
  },
  muted: {
    fontSize: 14,
    color: colors.muted,
  },
  username: {
    marginBottom: 8,
    fontSize: 20,
    fontWeight: "600",
    color: colors.text,
  },
  api: {
    marginBottom: 20,
    fontSize: 12,
    color: colors.muted,
  },
  partnerCard: {
    marginBottom: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.elevated,
    padding: 16,
    gap: 10,
  },
  partnerEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.accentSoft,
  },
  partnerName: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  partnerSub: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  code: {
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 6,
    color: colors.text,
  },
  emailLabel: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  inviteMessage: {
    fontSize: 13,
    color: colors.accentSoft,
  },
  linkRow: {
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  flex: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  linkSub: {
    marginTop: 4,
    fontSize: 13,
    color: colors.muted,
  },
  linkChevron: {
    fontSize: 22,
    color: colors.muted,
  },
  signOut: {
    marginTop: 40,
  },
});
