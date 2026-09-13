import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ApiError } from "@/src/api/client";
import {
  fetchOnboardingStatus,
  fetchOnboardingTemplates,
  setupOnboarding,
  type TogetherGoal,
} from "@/src/api/onboarding";
import {
  ensurePartnership,
  invitePartner,
  joinPartnership,
  normalizeInviteCode,
  formatInviteCodeInput,
} from "@/src/api/partnership";
import { ReminderTimePicker } from "@/src/components/ReminderTimePicker";
import { MovementPicker } from "@/src/components/onboarding/MovementPicker";
import {
  SpendLimitPicker,
  convertSpendTarget,
  formatTemplateTarget,
  type SpendPeriod,
} from "@/src/components/onboarding/SpendLimitPicker";
import { TemplatePicker } from "@/src/components/onboarding/TemplatePicker";
import { TogetherGoalsReview } from "@/src/components/onboarding/TogetherGoalsReview";
import { PrimaryButton, Screen } from "@/src/components/PrimaryButton";
import { formatReminderTime } from "@/src/notifications/reminders";
import { useAuthStore } from "@/src/store/authStore";
import { useCategoriesStore } from "@/src/store/categoriesStore";
import { useGroupsStore } from "@/src/store/groupsStore";
import { useReminderStore } from "@/src/store/reminderStore";
import { colors } from "@/src/theme/colors";
import type {
  GoalScope,
  GoalTemplate,
  GoalTemplateGroup,
  Partnership,
} from "@/src/types/api";

type Mode = "solo" | "couple";
type Step = "mode" | "invite" | "together" | "finance" | "fitness" | "habit" | "remind";

function otherMember(partnership: Partnership | null | undefined, username?: string) {
  if (!partnership) return undefined;
  return partnership.members.find((member) => member.username !== username);
}

function isLinked(partnership: Partnership | null | undefined, username?: string) {
  return !!otherMember(partnership, username) || !!partnership?.is_full;
}

const STEP_COPY: Record<
  Exclude<Step, "mode" | "invite" | "remind">,
  { title: string; body: string }
> = {
  finance: {
    title: "Spending limits",
    body: "Pick every category you want a cap for — Groceries, Gas, Going Out, Misc, or any mix — then set a weekly or monthly limit.",
  },
  fitness: {
    title: "Movement",
    body: "Pick running, biking, or workouts — then track 30 minutes, 5 miles, or sessions.",
  },
  habit: {
    title: "Other habits",
    body: "Small check-ins that make the end of the day feel finished.",
  },
};

export default function OnboardingScreen() {
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const loadCategories = useCategoriesStore((s) => s.load);
  const loadGroups = useGroupsStore((s) => s.load);
  const reminderHour = useReminderStore((s) => s.hour);
  const reminderMinute = useReminderStore((s) => s.minute);
  const enableReminders = useReminderStore((s) => s.enable);
  const saveReminderTime = useReminderStore((s) => s.setTime);

  const alreadyPaired = isLinked(user?.partnership, user?.username);
  const [startedPaired] = useState(alreadyPaired);
  const [step, setStep] = useState<Step>(alreadyPaired ? "finance" : "mode");
  const [mode, setMode] = useState<Mode>(
    alreadyPaired || user?.tracking_mode === "couple" ? "couple" : "solo"
  );
  const [templates, setTemplates] = useState<GoalTemplate[]>([]);
  const [selected, setSelected] = useState<Record<string, GoalScope>>({});
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [periods, setPeriods] = useState<Record<string, SpendPeriod | "daily">>({});
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [togetherGoals, setTogetherGoals] = useState<TogetherGoal[]>([]);
  const [approvedTogether, setApprovedTogether] = useState<Set<string>>(new Set());
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCode, setInviteCode] = useState(user?.partnership?.invite_code ?? "");
  const [partnerCode, setPartnerCode] = useState("");
  const [linkedName, setLinkedName] = useState(
    otherMember(user?.partnership, user?.username)?.username ?? ""
  );
  const [emailSent, setEmailSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await fetchOnboardingStatus();
        if (cancelled) return;
        if (status.partnership) {
          setMode("couple");
          setInviteCode(status.partnership.invite_code);
          const other = otherMember(status.partnership, user?.username);
          if (other) setLinkedName(other.username);
          if (isLinked(status.partnership, user?.username)) {
            setStep((current) => (current === "mode" ? "finance" : current));
          }
        }
        applyTogetherFromStatus(status.together_goals ?? []);
      } catch {
        // first-run users may not have status yet
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchOnboardingTemplates(mode);
        if (cancelled) return;
        setTemplates(data.templates);
        setSelected((prev) => {
          const next = { ...prev };
          const nextTargets: Record<string, string> = {};
          const nextPeriods: Record<string, SpendPeriod | "daily"> = {};
          for (const template of data.templates) {
            if (next[template.slug]) continue;
            const suggest = mode === "couple" ? template.suggest_couple : template.suggest_solo;
            if (suggest) {
              next[template.slug] =
                mode === "couple" ? template.suggested_scope : "personal";
              nextTargets[template.slug] = formatTemplateTarget(template.target_value);
              if (template.group === "finance") {
                nextPeriods[template.slug] = "monthly";
              } else if (template.period === "daily") {
                nextPeriods[template.slug] = "daily";
              } else {
                nextPeriods[template.slug] = "weekly";
              }
            }
          }
          if (Object.keys(nextTargets).length) {
            setTargets((t) => ({ ...nextTargets, ...t }));
          }
          if (Object.keys(nextPeriods).length) {
            setPeriods((p) => ({ ...nextPeriods, ...p }));
          }
          return next;
        });
      } catch {
        // keep empty until retry
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const byGroup = useMemo(() => {
    const groups: Record<GoalTemplateGroup, GoalTemplate[]> = {
      finance: [],
      fitness: [],
      habit: [],
    };
    for (const template of templates) {
      groups[template.group].push(template);
    }
    return groups;
  }, [templates]);

  const couple = mode === "couple";

  function applyTogetherFromStatus(goals: TogetherGoal[]) {
    setTogetherGoals(goals);
    setApprovedTogether(new Set(goals.map((goal) => goal.uuid)));
    const accepted = goals.filter((goal) => goal.accepted);
    if (accepted.length) applyApprovedLocks(accepted, goals);
    const pending = goals.filter((goal) => !goal.accepted);
    if (pending.length) {
      setStep((current) =>
        current === "mode" || current === "invite" || current === "finance"
          ? "together"
          : current
      );
    }
  }

  function applyApprovedLocks(approved: TogetherGoal[], catalog: TogetherGoal[]) {
    const slugs = approved
      .map((goal) => goal.template_slug)
      .filter((slug): slug is string => !!slug);
    setLocked(new Set(slugs));
    setSelected((prev) => {
      const next = { ...prev };
      for (const goal of catalog) {
        if (goal.template_slug) delete next[goal.template_slug];
      }
      for (const goal of approved) {
        if (goal.template_slug) next[goal.template_slug] = "shared";
      }
      return next;
    });
    setTargets((prev) => {
      const next = { ...prev };
      for (const goal of approved) {
        if (goal.template_slug) {
          next[goal.template_slug] = formatTemplateTarget(goal.target_value);
        }
      }
      return next;
    });
    setPeriods((prev) => {
      const next = { ...prev };
      for (const goal of approved) {
        if (!goal.template_slug) continue;
        if (goal.period === "daily" || goal.period === "weekly" || goal.period === "monthly") {
          next[goal.template_slug] = goal.period;
        }
      }
      return next;
    });
  }

  function toggle(template: GoalTemplate) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[template.slug]) {
        delete next[template.slug];
        setTargets((t) => {
          const copy = { ...t };
          delete copy[template.slug];
          return copy;
        });
        setPeriods((p) => {
          const copy = { ...p };
          delete copy[template.slug];
          return copy;
        });
      } else {
        next[template.slug] =
          couple && template.suggested_scope === "shared" ? "shared" : "personal";
        setTargets((t) => ({
          ...t,
          [template.slug]:
            t[template.slug] || formatTemplateTarget(template.target_value),
        }));
        setPeriods((p) => ({
          ...p,
          [template.slug]:
            p[template.slug] ??
            (template.group === "finance"
              ? "monthly"
              : template.period === "daily"
                ? "daily"
                : "weekly"),
        }));
      }
      return next;
    });
  }

  function setScope(slug: string, scope: GoalScope) {
    setSelected((prev) => ({ ...prev, [slug]: scope }));
  }

  function setMovementPeriod(slug: string, period: "daily" | "weekly") {
    setPeriods((prev) => ({ ...prev, [slug]: period }));
  }

  function setSpendPeriod(slug: string, period: SpendPeriod) {
    const current = periods[slug] ?? "monthly";
    if (current === period) return;
    if (current !== "weekly" && current !== "monthly") {
      setPeriods((prev) => ({ ...prev, [slug]: period }));
      return;
    }
    setPeriods((prev) => ({ ...prev, [slug]: period }));
    setTargets((prev) => {
      const value = prev[slug];
      if (!value) return prev;
      return { ...prev, [slug]: convertSpendTarget(value, current, period) };
    });
  }

  async function shareOwnCode() {
    setError(null);
    setLoading(true);
    try {
      const { partnership } = await ensurePartnership();
      setInviteCode(partnership.invite_code);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create a couple space");
    } finally {
      setLoading(false);
    }
  }

  async function joinWithPartnerCode() {
    const code = normalizeInviteCode(partnerCode);
    if (!code) return;
    if (inviteCode && code === normalizeInviteCode(inviteCode)) {
      setError("That's your code — ask your partner for theirs.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { partnership } = await joinPartnership(code);
      const other = otherMember(partnership, user?.username);
      if (!other) {
        setError("That's your code — ask your partner for theirs.");
        return;
      }
      setInviteCode(partnership.invite_code);
      setLinkedName(other.username);
      setPartnerCode("");
      await refreshUser();
      try {
        const status = await fetchOnboardingStatus();
        applyTogetherFromStatus(status.together_goals ?? []);
      } catch {
        // inherited templates are optional until setup
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not link with that code");
    } finally {
      setLoading(false);
    }
  }

  async function sendInvite() {
    const email = inviteEmail.trim();
    if (!email) return;
    setError(null);
    setLoading(true);
    try {
      const result = await invitePartner(email);
      setInviteCode(result.partnership.invite_code);
      setEmailSent(result.email_sent);
      if (!result.email_sent) {
        setError("Invite code is ready — email could not send, share the code instead.");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send invite");
    } finally {
      setLoading(false);
    }
  }

  async function shareCode() {
    if (!inviteCode) return;
    try {
      await Share.share({
        message: `Join me on NightCap — couple habit tracking. Invite code: ${inviteCode}`,
      });
    } catch {
      // user cancelled
    }
  }

  function back() {
    setError(null);
    if (step === "invite") setStep("mode");
    if (step === "together" && !startedPaired) setStep("invite");
    if (step === "finance")
      setStep(
        togetherGoals.some((goal) => !goal.accepted)
          ? "together"
          : couple && !startedPaired
            ? "invite"
            : "mode"
      );
    if (step === "fitness") setStep("finance");
    if (step === "habit") setStep("fitness");
    if (step === "remind") setStep("habit");
  }

  function nextFrom(current: Step) {
    if (current === "mode") {
      if (mode === "couple" && !startedPaired) {
        setStep("invite");
        return;
      }
      setStep("finance");
      return;
    }
    if (current === "invite") {
      setStep(togetherGoals.some((goal) => !goal.accepted) ? "together" : "finance");
      return;
    }
    if (current === "together") {
      applyApprovedLocks(
        togetherGoals.filter((goal) => approvedTogether.has(goal.uuid)),
        togetherGoals
      );
      setStep("finance");
      return;
    }
    if (current === "finance") setStep("fitness");
    if (current === "fitness") setStep("habit");
    if (current === "habit") setStep("remind");
    if (current === "remind") void finish(true);
  }

  async function finish(withReminder: boolean) {
    setError(null);
    if (withReminder) {
      await enableReminders();
    }
    setLoading(true);
    try {
      await setupOnboarding({
        mode,
        templates: Object.entries(selected).map(([slug, scope]) => ({
          slug,
          scope,
          ...(targets[slug] ? { target_value: targets[slug] } : {}),
          ...(periods[slug] ? { period: periods[slug] } : {}),
        })),
        invite_email:
          couple && inviteEmail.trim() && !emailSent ? inviteEmail.trim() : "",
        ...(togetherGoals.length
          ? { approve_together: [...approvedTogether] }
          : {}),
      });
      await refreshUser();
      await Promise.all([loadCategories(), loadGroups()]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save your setup");
    } finally {
      setLoading(false);
    }
  }

  function skipGroup(group: GoalTemplateGroup) {
    setSelected((prev) => {
      const next = { ...prev };
      for (const template of byGroup[group]) {
        if (!locked.has(template.slug)) delete next[template.slug];
      }
      return next;
    });
    setTargets((prev) => {
      const next = { ...prev };
      for (const template of byGroup[group]) {
        if (!locked.has(template.slug)) delete next[template.slug];
      }
      return next;
    });
    setPeriods((prev) => {
      const next = { ...prev };
      for (const template of byGroup[group]) {
        if (!locked.has(template.slug)) delete next[template.slug];
      }
      return next;
    });
    nextFrom(group);
  }

  const reviewTogether = togetherGoals.some((goal) => !goal.accepted);
  const steps: Step[] = startedPaired
    ? reviewTogether
      ? ["together", "finance", "fitness", "habit", "remind"]
      : ["finance", "fitness", "habit", "remind"]
    : couple
      ? reviewTogether
        ? ["mode", "invite", "together", "finance", "fitness", "habit", "remind"]
        : ["mode", "invite", "finance", "fitness", "habit", "remind"]
      : ["mode", "finance", "fitness", "habit", "remind"];
  const progress = Math.max(1, steps.indexOf(step) + 1);
  const total = steps.length;

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
          <Text style={styles.brand}>NightCap</Text>
          <Text style={styles.kicker}>Couple habit tracking</Text>
          <View style={styles.progress}>
            {Array.from({ length: total }).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i < progress && styles.dotOn]}
              />
            ))}
          </View>

          {step === "mode" ? (
            <>
              <Text style={styles.title}>Who’s this for?</Text>
              <Text style={styles.body}>
                You can enter their invite code or share yours next. Personal
                goals stay private either way.
              </Text>
              <Pressable
                onPress={() => setMode("solo")}
                style={[styles.card, mode === "solo" && styles.cardOn]}
              >
                <Text style={styles.cardEmoji}>🌙</Text>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>Just me</Text>
                  <Text style={styles.cardBody}>
                    Track spend, workouts, and habits on your own.
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => setMode("couple")}
                style={[styles.card, mode === "couple" && styles.cardOn]}
              >
                <Text style={styles.cardEmoji}>💛</Text>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>With my partner</Text>
                  <Text style={styles.cardBody}>
                    Share grocery budgets and couple habits, keep personal goals
                    just yours.
                  </Text>
                </View>
              </Pressable>
            </>
          ) : null}

          {step === "invite" ? (
            linkedName ? (
              <>
                <Text style={styles.title}>You’re linked</Text>
                <Text style={styles.body}>
                  You and {linkedName} share couple goals after you both
                  approve them. Personal ones stay just yours.
                </Text>
                <View style={styles.linkedCard}>
                  <Text style={styles.cardEmoji}>💛</Text>
                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle}>{linkedName}</Text>
                    <Text style={styles.cardBody}>
                      Shared caps and habits count both of you.
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.title}>Link with your person</Text>
                <Text style={styles.body}>
                  If they already have NightCap, enter their code. Otherwise
                  share yours — they’ll join after they create an account.
                </Text>
                <Text style={styles.labelFirst}>Their invite code</Text>
                <TextInput
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoComplete="off"
                  value={partnerCode}
                  onChangeText={(value) => setPartnerCode(formatInviteCodeInput(value))}
                  onSubmitEditing={() => void joinWithPartnerCode()}
                  returnKeyType="done"
                  placeholder="ABC123"
                  placeholderTextColor={colors.muted}
                  maxLength={8}
                  style={styles.input}
                />
                <PrimaryButton
                  title="Link with partner"
                  onPress={() => void joinWithPartnerCode()}
                  loading={loading}
                  disabled={normalizeInviteCode(partnerCode).length < 6}
                />
                <View style={styles.orRow}>
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>or invite them</Text>
                  <View style={styles.orLine} />
                </View>
                {inviteCode ? (
                  <>
                    <Text style={styles.code}>{inviteCode}</Text>
                    <PrimaryButton
                      title="Share invite code"
                      variant="secondary"
                      onPress={() => void shareCode()}
                    />
                    <Text style={styles.label}>Or email them</Text>
                    <TextInput
                      autoCapitalize="none"
                      keyboardType="email-address"
                      value={inviteEmail}
                      onChangeText={setInviteEmail}
                      placeholder="partner@email.com"
                      placeholderTextColor={colors.muted}
                      style={styles.input}
                    />
                    <PrimaryButton
                      title={emailSent ? "Invite sent" : "Send email invite"}
                      variant="secondary"
                      onPress={() => void sendInvite()}
                      loading={loading}
                      disabled={!inviteEmail.trim() || emailSent}
                    />
                  </>
                ) : (
                  <PrimaryButton
                    title="Share my own code instead"
                    variant="secondary"
                    onPress={() => void shareOwnCode()}
                    loading={loading}
                  />
                )}
              </>
            )
          ) : null}

          {step === "together" ? (
            <>
              <Text style={styles.title}>Together goals</Text>
              <Text style={styles.body}>
                {linkedName
                  ? `${linkedName} already set these up as together. Approve the ones you want to share — they count both of you.`
                  : "Approve the together goals already set up for this couple."}
              </Text>
              <TogetherGoalsReview
                goals={togetherGoals}
                approved={approvedTogether}
                partnerName={linkedName}
                onToggle={(uuid) => {
                  setApprovedTogether((prev) => {
                    const next = new Set(prev);
                    if (next.has(uuid)) next.delete(uuid);
                    else next.add(uuid);
                    return next;
                  });
                }}
              />
            </>
          ) : null}

          {step === "finance" ? (
            <>
              <Text style={styles.title}>{STEP_COPY.finance.title}</Text>
              <Text style={styles.body}>
                {couple
                  ? `${STEP_COPY.finance.body} Shared caps count both of you.`
                  : STEP_COPY.finance.body}
              </Text>
              <SpendLimitPicker
                templates={byGroup.finance}
                selected={selected}
                targets={targets}
                periods={periods}
                locked={locked}
                couple={couple}
                onToggle={toggle}
                onScope={setScope}
                onTarget={(slug, value) =>
                  setTargets((prev) => ({ ...prev, [slug]: value }))
                }
                onPeriod={setSpendPeriod}
              />
            </>
          ) : null}

          {step === "fitness" ? (
            <>
              <Text style={styles.title}>{STEP_COPY.fitness.title}</Text>
              <Text style={styles.body}>
                {couple
                  ? `${STEP_COPY.fitness.body} Mark household ones as Together.`
                  : STEP_COPY.fitness.body}
              </Text>
              <MovementPicker
                templates={byGroup.fitness}
                selected={selected}
                targets={targets}
                periods={periods}
                locked={locked}
                couple={couple}
                onToggle={toggle}
                onScope={setScope}
                onTarget={(slug, value) =>
                  setTargets((prev) => ({ ...prev, [slug]: value }))
                }
                onPeriod={setMovementPeriod}
              />
            </>
          ) : null}

          {step === "habit" ? (
            <>
              <Text style={styles.title}>{STEP_COPY.habit.title}</Text>
              <Text style={styles.body}>
                {couple
                  ? `${STEP_COPY.habit.body} Mark household ones as Together.`
                  : STEP_COPY.habit.body}
              </Text>
              <TemplatePicker
                templates={byGroup.habit}
                selected={selected}
                locked={locked}
                couple={couple}
                onToggle={toggle}
                onScope={setScope}
              />
            </>
          ) : null}

          {step === "remind" ? (
            <>
              <Text style={styles.title}>Nightly reminder</Text>
              <Text style={styles.body}>
                We’ll nudge you at{" "}
                {formatReminderTime(reminderHour, reminderMinute)} to wrap up
                the day. You can change this anytime in Settings.
              </Text>
              <ReminderTimePicker
                hour={reminderHour}
                minute={reminderMinute}
                onChange={(nextHour, nextMinute) => {
                  void saveReminderTime(nextHour, nextMinute);
                }}
              />
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            {steps.indexOf(step) > 0 ? (
              <Pressable onPress={back} hitSlop={8}>
                <Text style={styles.back}>Back</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <View style={styles.cta}>
              <PrimaryButton
                title={
                  step === "remind"
                    ? `Remind me at ${formatReminderTime(reminderHour, reminderMinute)}`
                    : step === "together"
                      ? approvedTogether.size
                        ? `Approve ${approvedTogether.size} together`
                        : "Continue"
                      : "Continue"
                }
                onPress={() => nextFrom(step)}
                loading={loading && step !== "invite"}
                disabled={step === "invite" && loading}
              />
              {step === "invite" && !linkedName ? (
                <Pressable
                  onPress={() =>
                    setStep(
                      togetherGoals.some((goal) => !goal.accepted)
                        ? "together"
                        : "finance"
                    )
                  }
                  hitSlop={8}
                >
                  <Text style={styles.skip}>Skip for now</Text>
                </Pressable>
              ) : null}
              {step === "together" ? (
                <Pressable
                  onPress={() => {
                    setApprovedTogether(new Set());
                    setLocked(new Set());
                    setStep("finance");
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.skip}>Skip these</Text>
                </Pressable>
              ) : null}
              {step === "finance" || step === "fitness" || step === "habit" ? (
                <Pressable onPress={() => skipGroup(step)} hitSlop={8}>
                  <Text style={styles.skip}>None of these</Text>
                </Pressable>
              ) : null}
              {step === "remind" ? (
                <Pressable onPress={() => void finish(false)} hitSlop={8}>
                  <Text style={styles.skip}>Not now</Text>
                </Pressable>
              ) : null}
            </View>
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
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 40,
  },
  brand: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.accentSoft,
  },
  kicker: {
    marginTop: 6,
    fontSize: 15,
    color: colors.muted,
  },
  progress: {
    flexDirection: "row",
    gap: 6,
    marginTop: 18,
    marginBottom: 28,
  },
  dot: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.elevated,
  },
  dotOn: {
    backgroundColor: colors.accent,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 10,
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.muted,
    marginBottom: 22,
  },
  card: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
    marginBottom: 12,
  },
  cardOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.18)",
  },
  cardEmoji: {
    fontSize: 32,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  cardBody: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  code: {
    textAlign: "center",
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: 8,
    color: colors.text,
    marginBottom: 16,
  },
  linkedCard: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.18)",
    padding: 16,
    marginBottom: 12,
  },
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 22,
    marginBottom: 8,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  orText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  label: {
    marginTop: 22,
    marginBottom: 8,
    fontSize: 14,
    color: colors.muted,
  },
  labelFirst: {
    marginBottom: 8,
    fontSize: 14,
    color: colors.muted,
  },
  input: {
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: colors.text,
  },
  error: {
    marginTop: 16,
    fontSize: 14,
    color: colors.danger,
  },
  actions: {
    marginTop: 28,
    gap: 16,
  },
  back: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.accentSoft,
  },
  cta: {
    gap: 12,
  },
  skip: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
  },
});
