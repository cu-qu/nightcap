import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { PrimaryButton } from "@/src/components/PrimaryButton";
import { useAuthStore } from "@/src/store/authStore";
import { useGroupsStore } from "@/src/store/groupsStore";
import { colors } from "@/src/theme/colors";
import { categoryGlyph } from "@/src/theme/iconMap";
import type { Category } from "@/src/types/api";
import type { GoalPeriod } from "@/src/types/goals";
import { sanitizeDecimalInput } from "@/src/utils/date";
import {
  defaultIntentForMetricKind,
  directionForIntent,
  type GoalIntent,
} from "@/src/utils/goalCopy";

type Props = {
  visible: boolean;
  initialPeriod: GoalPeriod;
  preferredGroupKey?: string | null;
  onClose: () => void;
  onSubmit: (input: {
    category_uuid: string;
    target_value: string;
    period: GoalPeriod;
    direction: "max" | "min";
    scope?: "personal" | "shared";
  }) => Promise<void>;
};

export function SetGoalSheet({
  visible,
  initialPeriod,
  preferredGroupKey,
  onClose,
  onSubmit,
}: Props) {
  const ritualGroups = useGroupsStore((s) => s.ritualGroups);
  const ungrouped = useGroupsStore((s) => s.ungrouped);
  const canShare = !!useAuthStore((s) => s.user?.partnership);
  const [period, setPeriod] = useState<GoalPeriod>(initialPeriod);
  const [intent, setIntent] = useState<GoalIntent>("stay_under");
  const [categoryUuid, setCategoryUuid] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [scope, setScope] = useState<"personal" | "shared">("personal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPeriod(initialPeriod);
    setIntent("stay_under");
    setCategoryUuid(null);
    setTarget("");
    setScope("personal");
    setError(null);
  }, [visible, initialPeriod]);

  const categories = useMemo(() => {
    const list: Category[] = [];
    const preferred = preferredGroupKey
      ? ritualGroups.find((g) => g.key === preferredGroupKey)
      : null;
    const ordered = preferred
      ? [preferred, ...ritualGroups.filter((g) => g.uuid !== preferred.uuid)]
      : ritualGroups;
    for (const g of ordered) {
      list.push(...g.categories);
    }
    list.push(...ungrouped);
    const seen = new Set<string>();
    return list.filter((c) => {
      if (seen.has(c.uuid)) return false;
      seen.add(c.uuid);
      return true;
    });
  }, [ritualGroups, ungrouped, preferredGroupKey]);

  const selected = categories.find((c) => c.uuid === categoryUuid) ?? null;

  function pickCategory(cat: Category) {
    setCategoryUuid(cat.uuid);
    setIntent(defaultIntentForMetricKind(cat.metric_kind));
  }

  const reachLabel =
    selected?.metric_kind === "boolean" ? "Complete" : "Reach";
  const reachHint =
    selected?.metric_kind === "amount"
      ? "Hit a money target (donate, invest, save)"
      : selected?.metric_kind === "boolean"
        ? "Do it a number of times"
        : "Hit a count or distance target";

  async function submit() {
    if (!selected || !target.trim()) {
      setError("Pick a category and target.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        category_uuid: selected.uuid,
        target_value: target.trim(),
        period,
        direction: directionForIntent(intent),
        ...(canShare ? { scope } : {}),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save goal");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>Set a goal</Text>
            <Text style={styles.hint}>
              Stay under a budget, or reach a target — like donating or investing.
            </Text>

            <Text style={styles.label}>Period</Text>
            <View style={styles.segment}>
              {(["weekly", "monthly"] as const).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setPeriod(p)}
                  style={[styles.segBtn, period === p && styles.segBtnOn]}
                >
                  <Text
                    style={[styles.segText, period === p && styles.segTextOn]}
                  >
                    {p === "weekly" ? "Weekly" : "Monthly"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Goal type</Text>
            <View style={styles.segment}>
              <Pressable
                onPress={() => setIntent("stay_under")}
                style={[
                  styles.segBtn,
                  intent === "stay_under" && styles.segBtnOn,
                ]}
              >
                <Text
                  style={[
                    styles.segText,
                    intent === "stay_under" && styles.segTextOn,
                  ]}
                >
                  Stay under
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setIntent("reach")}
                style={[styles.segBtn, intent === "reach" && styles.segBtnOn]}
              >
                <Text
                  style={[
                    styles.segText,
                    intent === "reach" && styles.segTextOn,
                  ]}
                >
                  {reachLabel}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.modeHint}>
              {intent === "stay_under"
                ? "Don’t go over this amount or count"
                : reachHint}
            </Text>

            <Text style={styles.label}>Category</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.catRow}
            >
              {categories.map((c) => {
                const on = c.uuid === categoryUuid;
                return (
                  <Pressable
                    key={c.uuid}
                    onPress={() => pickCategory(c)}
                    style={[styles.catChip, on && styles.catChipOn]}
                  >
                    <Text style={styles.catEmoji}>{categoryGlyph(c)}</Text>
                    <Text
                      style={[styles.catName, on && styles.catNameOn]}
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.label}>
              Target
              {selected?.metric_kind === "amount"
                ? " ($)"
                : selected?.metric_kind === "boolean"
                  ? " (times)"
                  : selected?.unit
                    ? ` (${selected.unit})`
                    : ""}
            </Text>
            <TextInput
              value={target}
              onChangeText={(t) => setTarget(sanitizeDecimalInput(t))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />

            {canShare ? (
              <>
                <Text style={styles.label}>Who is this for?</Text>
                <View style={styles.segment}>
                  <Pressable
                    onPress={() => setScope("shared")}
                    style={[styles.segBtn, scope === "shared" && styles.segBtnOn]}
                  >
                    <Text
                      style={[
                        styles.segText,
                        scope === "shared" && styles.segTextOn,
                      ]}
                    >
                      Together
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setScope("personal")}
                    style={[
                      styles.segBtn,
                      scope === "personal" && styles.segBtnOn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segText,
                        scope === "personal" && styles.segTextOn,
                      ]}
                    >
                      Just me
                    </Text>
                  </Pressable>
                </View>
                <Text style={styles.modeHint}>
                  {scope === "shared"
                    ? "Both of you log against the same target"
                    : "Only your entries count"}
                </Text>
              </>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.actions}>
              <PrimaryButton
                title={saving ? "Saving…" : "Save goal"}
                onPress={() => void submit()}
                disabled={saving}
                loading={saving}
              />
              <Pressable onPress={onClose} style={styles.cancel} hitSlop={8}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    maxHeight: "90%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surface,
    padding: 20,
    paddingBottom: 28,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },
  hint: {
    marginTop: 8,
    marginBottom: 16,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  label: {
    marginTop: 10,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  modeHint: {
    marginBottom: 4,
    fontSize: 13,
    color: colors.muted,
  },
  segment: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  segBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  segBtnOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.25)",
  },
  segText: {
    fontWeight: "600",
    color: colors.muted,
  },
  segTextOn: {
    color: colors.accentSoft,
  },
  catRow: {
    gap: 8,
    paddingBottom: 4,
  },
  catChip: {
    width: 96,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  catChipOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.25)",
  },
  catEmoji: {
    fontSize: 24,
  },
  catName: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    textAlign: "center",
  },
  catNameOn: {
    color: colors.accentSoft,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 24,
    fontWeight: "600",
    color: colors.text,
  },
  error: {
    marginTop: 10,
    color: colors.danger,
  },
  actions: {
    marginTop: 20,
    gap: 8,
  },
  cancel: {
    alignItems: "center",
    paddingVertical: 10,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.muted,
  },
});
