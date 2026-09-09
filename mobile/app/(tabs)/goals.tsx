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
import { iconFor } from "@/src/theme/iconMap";
import type { GoalPeriod } from "@/src/types/goals";

export default function GoalsScreen() {
  const summary = useGoalsStore((s) => s.summary);
  const periodFilter = useGoalsStore((s) => s.period);
  const loading = useGoalsStore((s) => s.loading);
  const error = useGoalsStore((s) => s.error);
  const load = useGoalsStore((s) => s.load);
  const setPeriodFilter = useGoalsStore((s) => s.setPeriod);
  const setGoal = useGoalsStore((s) => s.setGoal);
  const deactivateGoal = useGoalsStore((s) => s.deactivateGoal);
  const refreshRitual = useGroupsStore((s) => s.refreshRitual);
  const refreshGroups = useGroupsStore((s) => s.refresh);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [preferredGroupKey, setPreferredGroupKey] = useState<string | null>(
    null
  );

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
    setPreferredGroupKey(groupKey ?? null);
    setSheetOpen(true);
  }

  const counts = summary?.counts;

  return (
    <Screen>
      <SetGoalSheet
        visible={sheetOpen}
        initialPeriod={periodFilter}
        preferredGroupKey={preferredGroupKey}
        onClose={() => setSheetOpen(false)}
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
          Stay under, pass a count, or complete habits. Shared goals count both
          of you; personal ones stay just yours.
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
});
