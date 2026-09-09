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
} from "@/src/api/onboarding";
import { ensurePartnership, invitePartner } from "@/src/api/partnership";
import {
  SpendLimitPicker,
  convertSpendTarget,
  formatTemplateTarget,
  type SpendPeriod,
} from "@/src/components/onboarding/SpendLimitPicker";
import { TemplatePicker } from "@/src/components/onboarding/TemplatePicker";
import { PrimaryButton, Screen } from "@/src/components/PrimaryButton";
import { useAuthStore } from "@/src/store/authStore";
import { useCategoriesStore } from "@/src/store/categoriesStore";
import { useGroupsStore } from "@/src/store/groupsStore";
import { colors } from "@/src/theme/colors";
import type { GoalScope, GoalTemplate, GoalTemplateGroup } from "@/src/types/api";

type Mode = "solo" | "couple";
type Step = "mode" | "invite" | "finance" | "fitness" | "habit";

const STEP_COPY: Record<
  Exclude<Step, "mode" | "invite">,
  { title: string; body: string }
> = {
  finance: {
    title: "Spending limits",
    body: "Pick every category you want a cap for — Groceries, Gas, Going Out, Misc, or any mix — then set a weekly or monthly limit.",
  },
  fitness: {
    title: "Movement",
    body: "Workouts, walks, or whatever you’ll actually log tonight.",
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

  const alreadyPaired = !!user?.partnership;
  const [step, setStep] = useState<Step>(alreadyPaired ? "finance" : "mode");
  const [mode, setMode] = useState<Mode>(
    alreadyPaired || user?.tracking_mode === "couple" ? "couple" : "solo"
  );
  const [templates, setTemplates] = useState<GoalTemplate[]>([]);
  const [selected, setSelected] = useState<Record<string, GoalScope>>({});
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [periods, setPeriods] = useState<Record<string, SpendPeriod>>({});
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCode, setInviteCode] = useState(user?.partnership?.invite_code ?? "");
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
          setStep((current) => (current === "mode" ? "finance" : current));
        }
        const inherited = new Set(status.inherited_shared_templates);
        if (inherited.size) {
          setLocked(inherited);
          setSelected((prev) => {
            const next = { ...prev };
            for (const slug of inherited) next[slug] = "shared";
            return next;
          });
        }
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
          const nextPeriods: Record<string, SpendPeriod> = {};
          for (const template of data.templates) {
            if (next[template.slug]) continue;
            const suggest = mode === "couple" ? template.suggest_couple : template.suggest_solo;
            if (suggest) {
              next[template.slug] =
                mode === "couple" ? template.suggested_scope : "personal";
              nextTargets[template.slug] = formatTemplateTarget(template.target_value);
              if (template.group === "finance") {
                nextPeriods[template.slug] = "monthly";
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
          [template.slug]: p[template.slug] ?? "monthly",
        }));
      }
      return next;
    });
  }

  function setScope(slug: string, scope: GoalScope) {
    setSelected((prev) => ({ ...prev, [slug]: scope }));
  }

  function setSpendPeriod(slug: string, period: SpendPeriod) {
    const current = periods[slug] ?? "monthly";
    if (current === period) return;
    setPeriods((prev) => ({ ...prev, [slug]: period }));
    setTargets((prev) => {
      const value = prev[slug];
      if (!value) return prev;
      return { ...prev, [slug]: convertSpendTarget(value, current, period) };
    });
  }

  async function goInvite() {
    setError(null);
    setMode("couple");
    setLoading(true);
    try {
      const { partnership } = await ensurePartnership();
      setInviteCode(partnership.invite_code);
      setStep("invite");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create a couple space");
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
    if (step === "finance") setStep(couple && !alreadyPaired ? "invite" : "mode");
    if (step === "fitness") setStep("finance");
    if (step === "habit") setStep("fitness");
  }

  function nextFrom(current: Step) {
    if (current === "mode") {
      if (mode === "couple" && !alreadyPaired) {
        void goInvite();
        return;
      }
      setStep("finance");
      return;
    }
    if (current === "invite") setStep("finance");
    if (current === "finance") setStep("fitness");
    if (current === "fitness") setStep("habit");
    if (current === "habit") void finish();
  }

  async function finish() {
    setError(null);
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

  const steps: Step[] = alreadyPaired
    ? ["finance", "fitness", "habit"]
    : couple
      ? ["mode", "invite", "finance", "fitness", "habit"]
      : ["mode", "finance", "fitness", "habit"];
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
                You can always invite someone later. Personal goals stay private
                either way.
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
            <>
              <Text style={styles.title}>Invite your person</Text>
              <Text style={styles.body}>
                They’ll see shared goals. Your personal ones stay just yours.
                They can join with this code after they create an account.
              </Text>
              <Text style={styles.code}>{inviteCode || "••••••"}</Text>
              <PrimaryButton
                title="Share invite code"
                variant="secondary"
                onPress={() => void shareCode()}
                disabled={!inviteCode}
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

          {step === "fitness" || step === "habit" ? (
            <>
              <Text style={styles.title}>{STEP_COPY[step].title}</Text>
              <Text style={styles.body}>
                {couple
                  ? `${STEP_COPY[step].body} Mark household ones as Together.`
                  : STEP_COPY[step].body}
              </Text>
              <TemplatePicker
                templates={byGroup[step]}
                selected={selected}
                locked={locked}
                couple={couple}
                onToggle={toggle}
                onScope={setScope}
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
                  step === "habit"
                    ? "Start NightCap"
                    : step === "invite"
                      ? "Continue"
                      : "Continue"
                }
                onPress={() => nextFrom(step)}
                loading={loading}
              />
              {step === "invite" ? (
                <Pressable onPress={() => setStep("finance")} hitSlop={8}>
                  <Text style={styles.skip}>Skip for now</Text>
                </Pressable>
              ) : null}
              {step === "finance" || step === "fitness" || step === "habit" ? (
                <Pressable onPress={() => skipGroup(step)} hitSlop={8}>
                  <Text style={styles.skip}>None of these</Text>
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
  label: {
    marginTop: 22,
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
