import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  ensurePartnership,
  invitePartner,
  joinPartnership,
  leavePartnership,
  normalizeInviteCode,
  formatInviteCodeInput,
} from "@/src/api/partnership";
import { PrimaryButton, Screen } from "@/src/components/PrimaryButton";
import { ReminderTimePicker } from "@/src/components/ReminderTimePicker";
import { LEGAL_URLS } from "@/src/iap/products";
import { useCoupleIap } from "@/src/iap/useCoupleIap";
import { formatReminderTime, remindersSupported } from "@/src/notifications/reminders";
import { useAuthStore } from "@/src/store/authStore";
import { useReminderStore } from "@/src/store/reminderStore";
import { colors } from "@/src/theme/colors";
import { confirmDeleteAccount } from "@/src/utils/deleteAccountPrompt";
import { membershipSummary } from "@/src/utils/needsPaywall";

export default function SettingsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const partnership = user?.partnership;
  const other = partnership?.members.find((m) => m.username !== user?.username);

  const [email, setEmail] = useState("");
  const [partnerCode, setPartnerCode] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);

  const reminderEnabled = useReminderStore((s) => s.enabled);
  const reminderHour = useReminderStore((s) => s.hour);
  const reminderMinute = useReminderStore((s) => s.minute);
  const enableReminders = useReminderStore((s) => s.enable);
  const disableReminders = useReminderStore((s) => s.disable);
  const setReminderTime = useReminderStore((s) => s.setTime);
  const storeActive =
    user?.membership?.status === "active" ||
    user?.membership?.source === "store";
  const iap = useCoupleIap({
    user,
    onEntitled: () => refreshUser(),
  });

  useFocusEffect(
    useCallback(() => {
      void refreshUser();
    }, [refreshUser])
  );

  async function onToggleReminder(value: boolean) {
    setReminderBusy(true);
    setReminderMessage(null);
    try {
      if (value) {
        const ok = await enableReminders(reminderHour, reminderMinute);
        if (!ok) {
          setReminderMessage(
            remindersSupported()
              ? "Notifications are off for NightCap. Enable them in system Settings."
              : "Reminders are available on the iPhone and Android apps."
          );
        }
      } else {
        await disableReminders();
      }
    } catch (e) {
      setReminderMessage(
        e instanceof Error ? e.message : "Could not update reminder"
      );
    } finally {
      setReminderBusy(false);
    }
  }

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

  async function onJoinCode() {
    const code = normalizeInviteCode(partnerCode);
    if (!code) return;
    if (partnership?.invite_code && code === normalizeInviteCode(partnership.invite_code)) {
      setInviteMessage("That's your code — ask your partner for theirs.");
      return;
    }
    setInviteBusy(true);
    setInviteMessage(null);
    try {
      const { partnership: joined } = await joinPartnership(code);
      await refreshUser();
      const linked = joined.members.find((m) => m.username !== user?.username);
      setPartnerCode("");
      setInviteMessage(
        linked ? `Linked with ${linked.username}` : "You're linked with your partner."
      );
    } catch (e) {
      setInviteMessage(e instanceof Error ? e.message : "Could not link with that code");
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

  function onLeavePartnership() {
    const linkedName = other?.username;
    Alert.alert(
      linkedName ? "Unlink partner?" : "Use NightCap alone?",
      linkedName
        ? `You'll no longer share progress with ${linkedName}. Together goals become personal for both of you.`
        : "Your invite code will stop working. You can invite someone later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: linkedName ? "Unlink" : "Use NightCap alone",
          style: "destructive",
          onPress: () => void confirmLeavePartnership(!!linkedName),
        },
      ]
    );
  }

  async function confirmLeavePartnership(wasLinked: boolean) {
    setInviteBusy(true);
    setInviteMessage(null);
    try {
      await leavePartnership();
      await refreshUser();
      setInviteMessage(
        wasLinked
          ? "Unlinked. Together goals are now just yours."
          : "You're using NightCap alone."
      );
    } catch (e) {
      setInviteMessage(e instanceof Error ? e.message : "Could not unlink");
    } finally {
      setInviteBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.muted}>Signed in as</Text>
        <Text style={styles.username}>{user?.username ?? "—"}</Text>

        <View style={styles.reminderCard}>
          <View style={styles.reminderHeader}>
            <View style={styles.flex}>
              <Text style={styles.partnerEyebrow}>Nightly reminder</Text>
              <Text style={styles.reminderTitle}>
                {reminderEnabled
                  ? `Every day at ${formatReminderTime(reminderHour, reminderMinute)}`
                  : "Off"}
              </Text>
              <Text style={styles.partnerSub}>
                A nudge to close out spend, habits, and a good note.
              </Text>
            </View>
            <Switch
              value={reminderEnabled}
              onValueChange={(value) => void onToggleReminder(value)}
              disabled={reminderBusy}
              trackColor={{ false: colors.elevated, true: colors.accent }}
              thumbColor={colors.text}
              ios_backgroundColor={colors.elevated}
            />
          </View>
          <ReminderTimePicker
            hour={reminderHour}
            minute={reminderMinute}
            onChange={(hour, minute) => {
              void setReminderTime(hour, minute);
            }}
          />
          {reminderMessage ? (
            <Text style={styles.inviteMessage}>{reminderMessage}</Text>
          ) : null}
          {reminderMessage && remindersSupported() && Platform.OS !== "web" ? (
            <PrimaryButton
              title="Open system Settings"
              variant="secondary"
              onPress={() => void Linking.openSettings()}
            />
          ) : null}
        </View>

        <View style={styles.partnerCard}>
          <Text style={styles.partnerEyebrow}>Membership</Text>
          <Text style={styles.partnerName}>
            {user?.membership?.status === "active"
              ? "NightCap for two"
              : user?.membership?.status === "complimentary"
                ? "Complimentary"
                : user?.membership?.status === "trial"
                  ? "Free month"
                  : "Subscribe"}
          </Text>
          <Text style={styles.partnerSub}>{membershipSummary(user)}</Text>
          <PrimaryButton
            title={
              user?.membership?.status === "active" ||
              user?.membership?.status === "complimentary"
                ? "See plans / Restore"
                : "See plans"
            }
            variant="secondary"
            onPress={() => router.push("/paywall")}
          />
          {storeActive ? (
            <PrimaryButton
              title="Manage subscription"
              variant="ghost"
              onPress={() => void iap.manage()}
            />
          ) : null}
        </View>

        <View style={styles.partnerCard}>
          <Text style={styles.partnerEyebrow}>Your person</Text>
          {other ? (
            <>
              <Text style={styles.partnerName}>{other.username}</Text>
              <Text style={styles.partnerSub}>
                Shared goals count both of you. Personal goals stay private.
              </Text>
              <PrimaryButton
                title="Unlink partner"
                variant="secondary"
                onPress={onLeavePartnership}
                loading={inviteBusy}
              />
            </>
          ) : partnership ? (
            <>
              <Text style={styles.partnerName}>Waiting on a partner</Text>
              <Text style={styles.code}>{partnership.invite_code}</Text>
              <Text style={styles.partnerSub}>
                Share this code, or enter theirs if they already have NightCap.
              </Text>
              <PrimaryButton
                title="Share invite code"
                variant="secondary"
                onPress={() => void onShareCode()}
              />
              <Text style={styles.emailLabel}>Their invite code</Text>
              <TextInput
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                value={partnerCode}
                onChangeText={(value) => setPartnerCode(formatInviteCodeInput(value))}
                placeholder="ABC123"
                placeholderTextColor={colors.muted}
                maxLength={8}
                style={styles.input}
              />
              <PrimaryButton
                title="Link with partner"
                onPress={() => void onJoinCode()}
                loading={inviteBusy}
                disabled={normalizeInviteCode(partnerCode).length < 6}
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
              <Pressable
                onPress={onLeavePartnership}
                disabled={inviteBusy}
                hitSlop={6}
              >
                <Text style={styles.unlinkText}>Use NightCap alone</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.partnerName}>Using NightCap alone</Text>
              <Text style={styles.partnerSub}>
                Enter their code if they already have a couple space, or create
                yours to invite them. Personal goals stay just yours.
              </Text>
              <Text style={styles.emailLabel}>Their invite code</Text>
              <TextInput
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                value={partnerCode}
                onChangeText={(value) => setPartnerCode(formatInviteCodeInput(value))}
                placeholder="ABC123"
                placeholderTextColor={colors.muted}
                maxLength={8}
                style={styles.input}
              />
              <PrimaryButton
                title="Link with partner"
                onPress={() => void onJoinCode()}
                loading={inviteBusy}
                disabled={normalizeInviteCode(partnerCode).length < 6}
              />
              <PrimaryButton
                title="Invite a partner"
                variant="secondary"
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
          onPress={() => router.push("/recap/archive")}
          hitSlop={6}
        >
          <View style={styles.flex}>
            <Text style={styles.linkTitle}>Recaps</Text>
            <Text style={styles.linkSub}>
              Past months and years — photos, moments, and check-ins
            </Text>
          </View>
          <Text style={styles.linkChevron}>›</Text>
        </Pressable>

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

        <Pressable
          style={styles.linkRow}
          onPress={() => void Linking.openURL(LEGAL_URLS.privacy)}
          hitSlop={6}
        >
          <View style={styles.flex}>
            <Text style={styles.linkTitle}>Privacy</Text>
            <Text style={styles.linkSub}>How NightCap uses your data</Text>
          </View>
          <Text style={styles.linkChevron}>›</Text>
        </Pressable>

        <Pressable
          style={styles.linkRow}
          onPress={() => void Linking.openURL(LEGAL_URLS.terms)}
          hitSlop={6}
        >
          <View style={styles.flex}>
            <Text style={styles.linkTitle}>Terms</Text>
            <Text style={styles.linkSub}>Terms of service</Text>
          </View>
          <Text style={styles.linkChevron}>›</Text>
        </Pressable>

        <Pressable
          style={styles.linkRow}
          onPress={() => void Linking.openURL(LEGAL_URLS.support)}
          hitSlop={6}
        >
          <View style={styles.flex}>
            <Text style={styles.linkTitle}>Support</Text>
            <Text style={styles.linkSub}>Help and contact</Text>
          </View>
          <Text style={styles.linkChevron}>›</Text>
        </Pressable>

        <View style={styles.signOut}>
          <PrimaryButton
            title="Sign out"
            variant="secondary"
            onPress={() => void logout()}
          />
          <Pressable
            onPress={() => confirmDeleteAccount(logout)}
            hitSlop={8}
          >
            <Text style={styles.deleteAccount}>Delete account</Text>
          </Pressable>
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
    marginBottom: 20,
    fontSize: 20,
    fontWeight: "600",
    color: colors.text,
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
  reminderCard: {
    marginBottom: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 12,
  },
  reminderHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  reminderTitle: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
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
  unlinkText: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "600",
    color: colors.danger,
    textAlign: "center",
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
    gap: 16,
  },
  deleteAccount: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    color: colors.danger,
  },
});
