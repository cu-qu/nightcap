import { useLayoutEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AddCategoryModal } from "@/src/components/AddCategoryModal";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { useAuthStore } from "@/src/store/authStore";
import { useGroupsStore } from "@/src/store/groupsStore";
import { colors } from "@/src/theme/colors";
import { categoryGlyph } from "@/src/theme/iconMap";
import type { Category, CategoryCreateInput } from "@/src/types/api";
import { SPEND_GROUP_KEY } from "@/src/types/api";
import type { GoalPeriod, GroupGoalItem, SetGoalInput } from "@/src/types/goals";
import { sanitizeDecimalInput } from "@/src/utils/date";
import {
  defaultIntentForMetricKind,
  directionForIntent,
  intentForMode,
  nativeTargetInput,
  type GoalIntent,
} from "@/src/utils/goalCopy";

const ALL_GROUPS = "all";
const UNGROUPED = "ungrouped";

function groupLabel(g: { key: string; name: string }) {
  return g.key === SPEND_GROUP_KEY ? "Spend" : g.name;
}

type SheetPeriod = SetGoalInput["period"];

type Props = {
  visible: boolean;
  initialPeriod: GoalPeriod;
  preferredGroupKey?: string | null;
  existingGoal?: GroupGoalItem | null;
  onClose: () => void;
  onSubmit: (input: {
    category_uuid: string;
    target_value: string;
    period: SheetPeriod;
    direction: "max" | "min";
    scope?: "personal" | "shared";
  }) => Promise<void>;
};

export function SetGoalSheet({
  visible,
  initialPeriod,
  preferredGroupKey,
  existingGoal,
  onClose,
  onSubmit,
}: Props) {
  const ritualGroups = useGroupsStore((s) => s.ritualGroups);
  const groups = useGroupsStore((s) => s.groups);
  const ungrouped = useGroupsStore((s) => s.ungrouped);
  const createCategory = useGroupsStore((s) => s.createCategory);
  const canShare = !!useAuthStore((s) => s.user?.partnership);
  const [period, setPeriod] = useState<SheetPeriod>(initialPeriod);
  const editing = !!existingGoal;
  const [intent, setIntent] = useState<GoalIntent>("stay_under");
  const [categoryUuid, setCategoryUuid] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState(ALL_GROUPS);
  const [target, setTarget] = useState("");
  const [scope, setScope] = useState<"personal" | "shared">("personal");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!visible) return;
    setError(null);
    setAddOpen(false);
    if (existingGoal) {
      setPeriod(existingGoal.period);
      setIntent(intentForMode(existingGoal.mode));
      setCategoryUuid(existingGoal.category.uuid);
      setTarget(nativeTargetInput(existingGoal));
      setScope(existingGoal.scope === "shared" ? "shared" : "personal");
      setGroupFilter(ALL_GROUPS);
      return;
    }
    setPeriod(initialPeriod);
    setIntent("stay_under");
    setCategoryUuid(null);
    setTarget("");
    setScope("personal");
    setGroupFilter(preferredGroupKey || ALL_GROUPS);
  }, [visible, initialPeriod, preferredGroupKey, existingGoal]);

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

  const groupChips = useMemo(() => {
    const chips = [{ id: ALL_GROUPS, label: "All" }];
    for (const g of ritualGroups) {
      chips.push({ id: g.key || g.uuid, label: groupLabel(g) });
    }
    chips.push({ id: UNGROUPED, label: "Ungrouped" });
    return chips;
  }, [ritualGroups]);

  const visibleCategories = useMemo(() => {
    if (groupFilter === ALL_GROUPS) return categories;
    if (groupFilter === UNGROUPED) return ungrouped;
    const group = ritualGroups.find(
      (g) => g.key === groupFilter || g.uuid === groupFilter
    );
    return group?.categories ?? [];
  }, [categories, groupFilter, ritualGroups, ungrouped]);

  const selected =
    categories.find((c) => c.uuid === categoryUuid) ??
    existingGoal?.category ??
    null;

  const periodOptions: SheetPeriod[] =
    existingGoal?.period === "daily"
      ? ["daily", "weekly", "monthly"]
      : ["weekly", "monthly"];

  const addInitialGroupId = useMemo(() => {
    if (groupFilter === ALL_GROUPS || groupFilter === UNGROUPED) return null;
    return (
      groups.find((g) => g.key === groupFilter || g.uuid === groupFilter)?.id ??
      ritualGroups.find((g) => g.key === groupFilter || g.uuid === groupFilter)
        ?.id ??
      null
    );
  }, [groupFilter, groups, ritualGroups]);

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
        : "Hit a time, distance, or count target";

  async function onAddCategory(input: CategoryCreateInput) {
    setAdding(true);
    try {
      const created = await createCategory(input);
      setAddOpen(false);
      pickCategory(created);
      if (created.group_key) {
        setGroupFilter(created.group_key);
      } else if (created.group_uuid) {
        setGroupFilter(created.group_uuid);
      } else {
        setGroupFilter(UNGROUPED);
      }
    } catch (e) {
      Alert.alert(
        "Could not create category",
        e instanceof Error ? e.message : "Try again"
      );
    } finally {
      setAdding(false);
    }
  }

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
    <>
      <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.title}>
                {editing ? "Edit goal" : "Set a goal"}
              </Text>
              <Text style={styles.hint}>
                {editing
                  ? "Change the target, period, or who this is for."
                  : "Stay under a budget, or reach a target — like donating or investing."}
              </Text>

              <Text style={styles.label}>Period</Text>
              <View style={styles.segment}>
                {periodOptions.map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setPeriod(p)}
                    style={[styles.segBtn, period === p && styles.segBtnOn]}
                  >
                    <Text
                      style={[styles.segText, period === p && styles.segTextOn]}
                    >
                      {p === "daily"
                        ? "Daily"
                        : p === "weekly"
                          ? "Weekly"
                          : "Monthly"}
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

              {existingGoal ? (
                <>
                  <Text style={styles.label}>Category</Text>
                  <View style={styles.catWrap}>
                    <View style={[styles.catChip, styles.catChipOn]}>
                      <Text style={styles.catEmoji}>
                        {categoryGlyph(existingGoal.category)}
                      </Text>
                      <Text
                        style={[styles.catName, styles.catNameOn]}
                        numberOfLines={1}
                      >
                        {existingGoal.category.name}
                      </Text>
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.label}>Group</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterRow}
                  >
                    {groupChips.map((chip) => {
                      const on = chip.id === groupFilter;
                      return (
                        <Pressable
                          key={chip.id}
                          onPress={() => setGroupFilter(chip.id)}
                          style={[styles.filterChip, on && styles.filterChipOn]}
                        >
                          <Text
                            style={[
                              styles.filterText,
                              on && styles.filterTextOn,
                            ]}
                          >
                            {chip.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  <Text style={styles.label}>Category</Text>
                  <View style={styles.catWrap}>
                    {visibleCategories.map((c) => {
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
                    <Pressable
                      onPress={() => setAddOpen(true)}
                      style={[styles.catChip, styles.catChipNew]}
                    >
                      <Text style={styles.catEmoji}>＋</Text>
                      <Text style={styles.catName}>New</Text>
                    </Pressable>
                  </View>
                  {!visibleCategories.length ? (
                    <Text style={styles.modeHint}>
                      No categories here yet — add one to set a goal.
                    </Text>
                  ) : null}
                </>
              )}

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
                      style={[
                        styles.segBtn,
                        scope === "shared" && styles.segBtnOn,
                      ]}
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
                  title={
                    saving ? "Saving…" : editing ? "Save changes" : "Save goal"
                  }
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

      <AddCategoryModal
        visible={addOpen && visible}
        group={null}
        groups={groups}
        initialGroupId={addInitialGroupId}
        loading={adding}
        onClose={() => setAddOpen(false)}
        onSubmit={onAddCategory}
      />
    </>
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
  filterRow: {
    gap: 8,
    paddingBottom: 4,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterChipOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.25)",
  },
  filterText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
  },
  filterTextOn: {
    color: colors.accentSoft,
  },
  catWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
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
  catChipNew: {
    borderStyle: "dashed",
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
