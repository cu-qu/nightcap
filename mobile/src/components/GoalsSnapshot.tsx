import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { fetchCalendar } from "@/src/api/calendar";
import { GoalHealthPill } from "@/src/components/GoalHealthPill";
import { cacheCalendar, loadCachedCalendar } from "@/src/db/schema";
import {
  clampPercent,
  formatGoalNumber,
  healthStyle,
  uiHealth,
} from "@/src/lib/goalMode";
import { useGoalsStore } from "@/src/store/goalsStore";
import { useGroupsStore } from "@/src/store/groupsStore";
import { colors } from "@/src/theme/colors";
import { iconFor } from "@/src/theme/iconMap";
import type { CalendarDay } from "@/src/types/api";
import type { GoalPeriod, ModeMetrics } from "@/src/types/goals";
import {
  endOfWeek,
  formatCurrency,
  monthLabel,
  startOfWeek,
  toIsoDate,
  weekRangeLabel,
} from "@/src/utils/date";
import {
  summarizeGroupsForRange,
  type GroupPeriodSummary,
} from "@/src/utils/groupSummary";
import {
  buildHomeGroupSections,
  type HomeGroupSection,
} from "@/src/utils/homeGroupSections";

async function loadMonthDays(
  year: number,
  month: number
): Promise<CalendarDay[]> {
  const cached = await loadCachedCalendar(year, month);
  try {
    const data = await fetchCalendar(year, month);
    await cacheCalendar(year, month, data.days);
    return data.days;
  } catch {
    return cached ?? [];
  }
}

function MetricBar({
  label,
  metrics,
  amountStyle,
  tint,
}: {
  label: string;
  metrics: ModeMetrics;
  amountStyle?: boolean;
  tint: string;
}) {
  if (!metrics.goal_count) return null;
  const kind = amountStyle ? "amount" : "plain";
  const current = formatGoalNumber(metrics.current_total, kind);
  const target = formatGoalNumber(metrics.target_total, kind);
  const fill = clampPercent(metrics.percent_used);

  return (
    <View style={styles.metricBlock}>
      <View style={styles.metricHeader}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValues}>
          {current} of {target}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { width: `${fill}%`, backgroundColor: tint },
          ]}
        />
      </View>
    </View>
  );
}

function GroupSection({
  section,
  onOpenGoals,
}: {
  section: HomeGroupSection;
  onOpenGoals: () => void;
}) {
  const act = section.activity;
  const spend = act?.expense_total ?? 0;
  const entries = act?.entry_count ?? 0;
  const nights = act?.nights ?? 0;
  const emojis = act?.category_emojis ?? [];
  const qty = act?.quantity_total ?? 0;
  const stay = section.metrics?.stay_under;
  const pass = section.metrics?.pass;
  const completed = section.metrics?.completed;

  const healthKey = uiHealth(
    section.goalCounts.over > 0
      ? "over"
      : section.goalCounts.close > 0
        ? "close"
        : section.goalCounts.passed > 0
          ? "passed"
          : "healthy"
  );
  const tone = healthStyle(healthKey).color;

  return (
    <View style={styles.groupCard}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupEmoji}>{iconFor(section.icon)}</Text>
        <Text style={styles.groupName}>{section.name}</Text>
        {section.goalCounts.total > 0 ? (
          <Text style={styles.groupGoalCount}>
            {section.goalCounts.total} goal
            {section.goalCounts.total === 1 ? "" : "s"}
          </Text>
        ) : null}
      </View>

      <View style={styles.totalsRow}>
        {spend > 0 ? (
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatCurrency(spend)}</Text>
            <Text style={styles.statLabel}>spend</Text>
          </View>
        ) : null}
        {entries > 0 ? (
          <View style={styles.stat}>
            <Text style={styles.statValue}>{entries}</Text>
            <Text style={styles.statLabel}>
              entr{entries === 1 ? "y" : "ies"}
            </Text>
          </View>
        ) : null}
        {nights > 0 ? (
          <View style={styles.stat}>
            <Text style={styles.statValue}>{nights}</Text>
            <Text style={styles.statLabel}>
              night{nights === 1 ? "" : "s"}
            </Text>
          </View>
        ) : null}
        {qty > 0 && spend <= 0 ? (
          <View style={styles.stat}>
            <Text style={styles.statValue}>{Math.round(qty * 10) / 10}</Text>
            <Text style={styles.statLabel}>qty</Text>
          </View>
        ) : null}
        {!spend && !entries && !nights && !qty ? (
          <Text style={styles.noActivity}>No activity this period</Text>
        ) : null}
      </View>

      {emojis.length > 0 ? (
        <Text style={styles.emojis} numberOfLines={1}>
          {emojis.slice(0, 10).join(" ")}
        </Text>
      ) : null}

      <View style={styles.goalsBlock}>
        <Text style={styles.goalsLabel}>Goals</Text>

        {stay && stay.goal_count > 0 ? (
          <MetricBar
            label="Stay under"
            metrics={stay}
            amountStyle
            tint={tone}
          />
        ) : null}
        {pass && pass.goal_count > 0 ? (
          <MetricBar label="Pass" metrics={pass} tint="#2DD4BF" />
        ) : null}
        {completed && completed.goal_count > 0 ? (
          <MetricBar label="Complete" metrics={completed} tint="#34D399" />
        ) : null}

        {section.goalCounts.total > 0 ? (
          <View style={styles.followCounts}>
            {section.goalCounts.healthy > 0 ? (
              <Text style={[styles.countChip, { color: "#2DD4BF" }]}>
                {section.goalCounts.healthy} on track
              </Text>
            ) : null}
            {section.goalCounts.close > 0 ? (
              <Text style={[styles.countChip, { color: "#FBBF24" }]}>
                {section.goalCounts.close} close
              </Text>
            ) : null}
            {section.goalCounts.passed > 0 ? (
              <Text style={[styles.countChip, { color: "#34D399" }]}>
                {section.goalCounts.passed} done
              </Text>
            ) : null}
            {section.goalCounts.over > 0 ? (
              <Text style={[styles.countChip, { color: "#F87171" }]}>
                {section.goalCounts.over} over
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={styles.noGoals}>No goals in this group yet</Text>
        )}

        {section.goals.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillsRow}
          >
            {section.goals.map((goal) => (
              <GoalHealthPill
                key={goal.uuid}
                goal={goal}
                onPress={onOpenGoals}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}

export function GoalsSnapshot() {
  const router = useRouter();
  const summary = useGoalsStore((s) => s.summary);
  const period = useGoalsStore((s) => s.period);
  const loading = useGoalsStore((s) => s.loading);
  const load = useGoalsStore((s) => s.load);
  const setPeriod = useGoalsStore((s) => s.setPeriod);
  const ritualGroups = useGroupsStore((s) => s.ritualGroups);
  const groups = useGroupsStore((s) => s.groups);
  const refreshGroups = useGroupsStore((s) => s.refresh);

  const [activity, setActivity] = useState<GroupPeriodSummary[]>([]);
  const [rangeLabel, setRangeLabel] = useState("");
  const [loadingActivity, setLoadingActivity] = useState(false);

  const loadActivity = useCallback(async (p: GoalPeriod) => {
    setLoadingActivity(true);
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      if (p === "weekly") {
        const weekStart = startOfWeek(now);
        const weekEnd = endOfWeek(now);
        const weekStartIso = toIsoDate(weekStart);
        const weekEndIso = toIsoDate(weekEnd);
        setRangeLabel(weekRangeLabel(weekStart, weekEnd));

        const monthsNeeded = new Map<string, { y: number; m: number }>();
        monthsNeeded.set(
          `${weekStart.getFullYear()}-${weekStart.getMonth() + 1}`,
          { y: weekStart.getFullYear(), m: weekStart.getMonth() + 1 }
        );
        monthsNeeded.set(
          `${weekEnd.getFullYear()}-${weekEnd.getMonth() + 1}`,
          { y: weekEnd.getFullYear(), m: weekEnd.getMonth() + 1 }
        );

        const dayLists = await Promise.all(
          [...monthsNeeded.values()].map(({ y, m }) => loadMonthDays(y, m))
        );
        const unique = new Map(dayLists.flat().map((d) => [d.date, d]));
        setActivity(
          summarizeGroupsForRange([...unique.values()], weekStartIso, weekEndIso)
        );
      } else {
        setRangeLabel(monthLabel(year, month));
        const monthStartIso = `${year}-${String(month).padStart(2, "0")}-01`;
        const monthEndIso = toIsoDate(new Date(year, month, 0));
        const days = await loadMonthDays(year, month);
        setActivity(
          summarizeGroupsForRange(days, monthStartIso, monthEndIso)
        );
      }
    } finally {
      setLoadingActivity(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshGroups();
      void loadActivity(period);
    }, [refreshGroups, loadActivity, period])
  );

  const sections = useMemo(
    () =>
      buildHomeGroupSections({
        ritualGroups,
        groups,
        activity,
        goalSummary: summary,
      }),
    [ritualGroups, groups, activity, summary]
  );

  const counts = summary?.counts;
  const busy = loading || loadingActivity;

  async function onPeriod(next: GoalPeriod) {
    if (next === period) return;
    setPeriod(next);
    await Promise.all([load(next), loadActivity(next)]);
  }

  function openGoals() {
    router.push("/(tabs)/goals");
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <View>
          <Text style={styles.title}>Your groups</Text>
          {rangeLabel ? (
            <Text style={styles.range}>{rangeLabel}</Text>
          ) : null}
        </View>
        <View style={styles.segment}>
          {(["weekly", "monthly"] as const).map((p) => {
            const on = period === p;
            return (
              <Pressable
                key={p}
                onPress={() => void onPeriod(p)}
                style={[styles.segBtn, on && styles.segBtnOn]}
              >
                <Text style={[styles.segText, on && styles.segTextOn]}>
                  {p === "weekly" ? "This week" : "This month"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {counts && counts.total > 0 ? (
        <View style={styles.chips}>
          {counts.healthy > 0 ? (
            <Chip label="on track" value={counts.healthy} color="#2DD4BF" />
          ) : null}
          {counts.close > 0 ? (
            <Chip label="close" value={counts.close} color="#FBBF24" />
          ) : null}
          {counts.over > 0 ? (
            <Chip label="over" value={counts.over} color="#F87171" />
          ) : null}
          {counts.passed > 0 ? (
            <Chip label="done" value={counts.passed} color="#34D399" />
          ) : null}
        </View>
      ) : null}

      {busy && !sections.length ? (
        <Text style={styles.quiet}>Loading…</Text>
      ) : sections.length === 0 ? (
        <Text style={styles.quiet}>
          No active groups yet. Add them in Settings → Categories & Groups.
        </Text>
      ) : (
        <View style={styles.sections}>
          {sections.map((section) => (
            <GroupSection
              key={section.id}
              section={section}
              onOpenGoals={openGoals}
            />
          ))}
        </View>
      )}

      <Pressable onPress={openGoals} style={styles.cta} hitSlop={8}>
        <Text style={styles.ctaText}>
          {!counts || counts.total === 0 ? "Set a goal" : "See all goals"}
        </Text>
      </Pressable>
    </View>
  );
}

function Chip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={[styles.chip, { backgroundColor: `${color}22` }]}>
      <Text style={[styles.chipText, { color }]}>
        {value} {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 28,
  },
  top: {
    gap: 12,
    marginBottom: 14,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
  },
  range: {
    marginTop: 4,
    fontSize: 14,
    color: colors.muted,
  },
  segment: {
    flexDirection: "row",
    gap: 6,
  },
  segBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  segBtnOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.22)",
  },
  segText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
  },
  segTextOn: {
    color: colors.accentSoft,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  quiet: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  sections: {
    gap: 12,
  },
  groupCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  groupEmoji: {
    fontSize: 22,
  },
  groupName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  groupGoalCount: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },
  totalsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 6,
  },
  stat: {
    minWidth: 56,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  statLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  noActivity: {
    fontSize: 13,
    color: colors.muted,
  },
  emojis: {
    marginBottom: 8,
    fontSize: 16,
  },
  goalsBlock: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 8,
  },
  goalsLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.accentSoft,
  },
  metricBlock: {
    gap: 6,
  },
  metricHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metricValues: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  barTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.elevated,
    overflow: "hidden",
  },
  barFill: {
    height: 6,
    borderRadius: 999,
  },
  followCounts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  countChip: {
    fontSize: 12,
    fontWeight: "600",
  },
  noGoals: {
    fontSize: 13,
    color: colors.muted,
  },
  pillsRow: {
    gap: 8,
    paddingVertical: 2,
  },
  cta: {
    marginTop: 14,
    alignSelf: "flex-start",
  },
  ctaText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.accentSoft,
  },
});
