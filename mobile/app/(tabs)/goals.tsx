import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { GoalHealthCard } from "@/src/components/GoalHealthCard";
import { PrimaryButton, Screen } from "@/src/components/PrimaryButton";
import { SetGoalSheet } from "@/src/components/SetGoalSheet";
import { useGoalsStore } from "@/src/store/goalsStore";
import { useGroupsStore } from "@/src/store/groupsStore";
import { colors } from "@/src/theme/colors";
import { categoryGlyph, iconFor } from "@/src/theme/iconMap";
import type { GoalPeriod, GroupGoalItem, PendingTogetherGoal } from "@/src/types/goals";

export default function GoalsScreen() {
  const summary = useGoalsStore((s) => s.summary);
  const pending = useGoalsStore((s) => s.pending);
  const periodFilter = useGoalsStore((s) => s.period);
  const loading = useGoalsStore((s) => s.loading);
  const error = useGoalsStore((s) => s.error);
  const load = useGoalsStore((s) => s.load);
  const setPeriodFilter = useGoalsStore((s) => s.setPeriod);
  const setGoal = useGoalsStore((s) => s.setGoal);
  const acceptPending = useGoalsStore((s) => s.acceptPending);
  const declinePending = useGoalsStore((s) => s.declinePending);
  const deactivateGoal = useGoalsStore((s) => s.deactivateGoal);
  const refreshRitual = useGroupsStore((s) => s.refreshRitual);
  const refreshGroups = useGroupsStore((s) => s.refresh);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GroupGoalItem | null>(null);
  const [preferredGroupKey, setPreferredGroupKey] = useState<string | null>(
    null
  );
  const [pendingBusy, setPendingBusy] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      void load(periodFilter);
      void refreshRitual();
      void refreshGroups();
    }, [load, periodFilter, refreshRitual, refreshGroups])
  );

  async function onPeriod(period: GoalPeriod) {
    if (period === periodFilter) return;
    setPeriodFilter(period);
    await load(period);
  }

  function openSheet(groupKey?: string | null) {
    setEditingGoal(null);
    setPreferredGroupKey(groupKey ?? null);
    setSheetOpen(true);
  }

  function openEdit(goal: GroupGoalItem) {
    setPreferredGroupKey(null);
    setEditingGoal(goal);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingGoal(null);
  }

  async function respondToPending(
    goal: PendingTogetherGoal,
    decision: "approve" | "decline"
  ) {
    setPendingBusy(goal.id);
    try {
      if (decision === "approve") await acceptPending(goal.id);
      else await declinePending(goal.id);
    } finally {
      setPendingBusy(null);
    }
  }

  const counts = summary?.counts;

  return (
    <Screen>
      <SetGoalSheet
        visible={sheetOpen}
        initialPeriod={periodFilter}
        preferredGroupKey={preferredGroupKey}
        existingGoal={editingGoal}
        onClose={closeSheet}
        onSubmit={async (input) => {
          await setGoal(input);
        }}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void load(periodFilter)}
            tintColor={colors.accent}
          />
        }
      >
        <Text style={styles.intro}>
          Stay under, pass a count, or complete habits. Together goals count
          both of you after you each approve. Personal ones stay just yours.
        </Text>

        <View style={styles.segment}>
          {(["weekly", "monthly"] as const).map((p) => {
            const on = periodFilter === p;
            return (
              <Pressable
                key={p}
                onPress={() => void onPeriod(p)}
                style={[styles.segBtn, on && styles.segBtnOn]}
              >
                <Text style={[styles.segText, on && styles.segTextOn]}>
                  {p === "weekly" ? "Weekly" : "Monthly"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {counts && counts.total > 0 ? (
          <View style={styles.chips}>
            <CountChip label="Healthy" value={counts.healthy} tone="#2DD4BF" />
            <CountChip label="Close" value={counts.close} tone="#FBBF24" />
            <CountChip label="Passed" value={counts.passed} tone="#34D399" />
            <CountChip label="Over" value={counts.over} tone="#F87171" />
          </View>
        ) : null}

        {loading && !summary ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {pending.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Needs approval</Text>
            <Text style={styles.pendingLead}>
              A together goal counts for both of you only after you each approve it.
            </Text>
            {pending.map((goal) => (
              <PendingTogetherCard
                key={goal.uuid}
                goal={goal}
                busy={pendingBusy === goal.id}
                onApprove={() => void respondToPending(goal, "approve")}
                onDecline={() => void respondToPending(goal, "decline")}
              />
            ))}
          </View>
        ) : null}

        {(summary?.groups ?? []).map((group) => (
          <View key={group.uuid ?? group.key ?? group.name} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionEmoji}>{iconFor(group.icon)}</Text>
              <View style={styles.sectionTitles}>
                <Text style={styles.sectionTitle}>{group.name}</Text>
                <Text style={styles.sectionPeriod}>
                  {periodFilter === "weekly" ? "Per week" : "Per month"}
                </Text>
              </View>
            </View>

            {group.goals.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  No goals {periodFilter === "weekly" ? "per week" : "per month"}{" "}
                  in this group yet.
                </Text>
                <PrimaryButton
                  title="Set a goal"
                  variant="secondary"
                  onPress={() => openSheet(group.key)}
                />
              </View>
            ) : (
              group.goals.map((goal) => (
                <GoalHealthCard
                  key={goal.uuid}
                  goal={goal}
                  onEdit={openEdit}
                  onDelete={(g) => void deactivateGoal(g.id)}
                />
              ))
            )}
          </View>
        ))}

        {!loading && summary && summary.groups.length === 0 ? (
          <Text style={styles.emptyText}>
            No groups yet. Add categories under Settings → Categories & Groups.
          </Text>
        ) : null}

        <View style={styles.footerCta}>
          <PrimaryButton title="Set a goal" onPress={() => openSheet(null)} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function PendingTogetherCard({
  goal,
  busy,
  onApprove,
  onDecline,
}: {
  goal: PendingTogetherGoal;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const waiting = goal.status === "waiting_on_partner";
  const partner = goal.partner_username || "your partner";
  const proposer = goal.proposed_by_username || "Your partner";
  return (
    <View style={styles.pendingCard}>
      <View style={styles.topRow}>
        <Text style={styles.pendingEmoji}>
          {categoryGlyph({
            emoji: goal.category_emoji,
            icon: goal.category_icon,
            name: goal.category_name || goal.display_name,
          })}
        </Text>
        <View style={styles.sectionTitles}>
          <Text style={styles.pendingName} numberOfLines={1}>
            {goal.display_name}
          </Text>
          <Text style={styles.pendingMeta}>{goal.target_label}</Text>
          <Text style={styles.pendingSub}>
            {waiting
              ? `Waiting for ${partner} to approve.`
              : `${proposer} wants this together.`}
          </Text>
        </View>
      </View>
      <View style={styles.pendingActions}>
        {waiting ? (
          <Pressable
            onPress={onDecline}
            disabled={busy}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Cancel together request for ${goal.display_name}`}
          >
            <Text style={styles.removeText}>
              {busy ? "Canceling…" : "Cancel request"}
            </Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              onPress={onApprove}
              disabled={busy}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Approve ${goal.display_name}`}
            >
              <Text style={styles.editText}>{busy ? "Saving…" : "Approve"}</Text>
            </Pressable>
            <Pressable
              onPress={onDecline}
              disabled={busy}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Skip ${goal.display_name}`}
            >
              <Text style={styles.removeText}>{busy ? "Saving…" : "Not now"}</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function CountChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  if (!value) return null;
  return (
    <View style={[styles.chip, { backgroundColor: `${tone}22` }]}>
      <Text style={[styles.chipText, { color: tone }]}>
        {label} {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 48,
  },
  intro: {
    marginBottom: 14,
    fontSize: 15,
    lineHeight: 21,
    color: colors.muted,
  },
  segment: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  segBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  segBtnOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.25)",
  },
  segText: {
    fontWeight: "700",
    color: colors.muted,
  },
  segTextOn: {
    color: colors.accentSoft,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 18,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  error: {
    marginBottom: 12,
    color: colors.danger,
  },
  section: {
    marginBottom: 22,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  sectionEmoji: {
    fontSize: 20,
  },
  sectionTitles: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  sectionPeriod: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  emptyBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  footerCta: {
    marginTop: 8,
  },
  pendingLead: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  pendingCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    padding: 16,
    marginBottom: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  pendingEmoji: {
    fontSize: 28,
    marginTop: 2,
  },
  pendingName: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  pendingMeta: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "600",
    color: colors.accentSoft,
  },
  pendingSub: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  pendingActions: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  editText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.accentSoft,
  },
  removeText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.danger,
  },
});
