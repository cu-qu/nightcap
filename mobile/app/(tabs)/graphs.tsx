import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { fetchCharts } from "@/src/api/charts";
import { getGroupSummary } from "@/src/api/goals";
import { ChartBars } from "@/src/components/ChartBars";
import { GoalHealthPill } from "@/src/components/GoalHealthPill";
import { Screen } from "@/src/components/PrimaryButton";
import { useAuthStore } from "@/src/store/authStore";
import { useGroupsStore } from "@/src/store/groupsStore";
import { colors } from "@/src/theme/colors";
import { categoryGlyph, iconFor } from "@/src/theme/iconMap";
import type { ChartCategory, ChartGroup, ChartResponse } from "@/src/types/api";
import { SPEND_GROUP_KEY } from "@/src/types/api";
import type { GoalPeriod, GroupGoalItem } from "@/src/types/goals";
import {
  ALL_FILTER,
  formatQtyLong,
  formatSpendDelta,
  groupFilterId,
} from "@/src/utils/calendarStats";
import {
  axisLabel,
  categoryDisplay,
  chartCategoryName,
  formatBarValue,
  pointValue,
  seriesForFilter,
} from "@/src/utils/chartMetrics";
import { monthLabel, parseIsoDate } from "@/src/utils/date";

export default function ChartsScreen() {
  const router = useRouter();
  const hasPartner = !!useAuthStore((s) => s.user?.partnership);
  const groups = useGroupsStore((s) => s.groups);
  const loadGroups = useGroupsStore((s) => s.load);

  const [period, setPeriod] = useState<"daily" | "weekly">("daily");
  const [filterId, setFilterId] = useState(ALL_FILTER);
  const [data, setData] = useState<ChartResponse | null>(null);
  const [goals, setGoals] = useState<GroupGoalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goalPeriod: GoalPeriod = period === "weekly" ? "weekly" : "monthly";

  const load = useCallback(
    async (p: "daily" | "weekly", groupId: string) => {
        setError(null);
        try {
          const group = groupId === ALL_FILTER ? undefined : groupId;
          const charts = await fetchCharts(p, { group });
          setData(charts);
          try {
            const summary = await getGroupSummary(
              p === "weekly" ? "weekly" : "monthly"
            );
            const buckets = summary.groups ?? [];
            const matching =
              groupId === ALL_FILTER
                ? buckets.flatMap((g) => g.goals)
                : buckets
                    .filter((g) => g.key === groupId || g.uuid === groupId)
                    .flatMap((g) => g.goals);
            setGoals(matching);
          } catch {
            setGoals([]);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to load charts");
        }
    },
    []
  );

  useEffect(() => {
    if (!groups.length) void loadGroups();
  }, [groups.length, loadGroups]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      void (async () => {
        try {
          await load(period, filterId);
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [period, filterId, load])
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load(period, filterId);
    } finally {
      setRefreshing(false);
    }
  }

  const filterChips = useMemo(() => {
    const chips = [
      { id: ALL_FILTER, label: "All" },
      ...[...groups]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((g) => ({
          id: groupFilterId(g),
          label: g.key === SPEND_GROUP_KEY ? "Spend" : g.name,
        }))
        .filter((c) => c.id),
    ];
    return chips;
  }, [groups]);

  const series = useMemo(
    () => seriesForFilter(filterId, data?.points ?? []),
    [filterId, data]
  );

  const barPoints = useMemo(() => {
    const points = data?.points ?? [];
    return points.map((p, i) => {
      const iso = period === "weekly" ? p.week_start : p.date;
      const value = pointValue(p, series);
      return {
        key: iso || `${period}-${i}`,
        label: axisLabel(iso, period),
        value,
        display: formatBarValue(value, series),
      };
    });
  }, [data, period, series]);

  const rangeLabel = useMemo(() => {
    if (!data) return "";
    if (period === "daily") {
      const start = parseIsoDate(data.start_date);
      return monthLabel(start.getFullYear(), start.getMonth() + 1);
    }
    const start = parseIsoDate(data.start_date);
    const end = parseIsoDate(data.end_date);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
  }, [data, period]);

  const totalsLine = useMemo(() => {
    if (!data) return "";
    const parts: string[] = [];
    const spend = (data.by_group ?? []).reduce(
      (s, g) => s + (Number(g.expense_total) || 0),
      0
    );
    const showSpend =
      filterId === ALL_FILTER ||
      filterId === SPEND_GROUP_KEY ||
      (spend > 0 && series.kind === "spend");
    if (showSpend && spend) parts.push(formatSpendDelta(spend));
    const unitTotals = new Map<string, number>();
    for (const cat of data.by_category ?? []) {
      if (cat.metric_kind === "amount" || cat.metric_kind === "boolean") continue;
      const q = Number(cat.quantity_total) || 0;
      if (!q) continue;
      const unit = cat.unit || "count";
      unitTotals.set(unit, (unitTotals.get(unit) || 0) + q);
    }
    for (const [unit, total] of unitTotals) {
      const line = formatQtyLong(total, unit);
      if (line) parts.push(line);
    }
    return parts.join(" · ");
  }, [data, filterId, series.kind]);

  const together = data?.together;
  const showTogether =
    (together?.together_count || 0) + (together?.alone_count || 0) > 0 &&
    (hasPartner || (together?.together_count || 0) > 0);

  const categories = useMemo(() => {
    const rows = [...(data?.by_category ?? [])]
      .map((cat) => ({ cat, display: categoryDisplay(cat) }))
      .filter((row) => row.display.label);
    rows.sort(
      (a, b) =>
        Number(b.display.spendish) - Number(a.display.spendish) ||
        b.display.value - a.display.value
    );
    return rows;
  }, [data]);

  const byGroup = data?.by_group ?? [];

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.accent}
          />
        }
      >
        <Text style={styles.intro}>
          Spend, habits, and together time — by day or week, and by group.
        </Text>

        <View style={styles.segment}>
          {(["daily", "weekly"] as const).map((p) => {
            const on = period === p;
            return (
              <Pressable
                key={p}
                onPress={() => setPeriod(p)}
                style={[styles.segBtn, on && styles.segBtnOn]}
              >
                <Text style={[styles.segText, on && styles.segTextOn]}>
                  {p === "daily" ? "Daily" : "Weekly"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {filterChips.map((chip) => {
            const on = filterId === chip.id;
            return (
              <Pressable
                key={chip.id}
                onPress={() => setFilterId(chip.id)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {rangeLabel || totalsLine ? (
          <View style={styles.banner}>
            <View style={styles.bannerText}>
              <Text style={styles.bannerLabel}>{rangeLabel}</Text>
              {totalsLine ? (
                <Text
                  style={[
                    styles.bannerValue,
                    totalsLine.startsWith("-") && styles.bannerSpend,
                  ]}
                >
                  {totalsLine}
                </Text>
              ) : (
                <Text style={styles.bannerQuiet}>No activity in this range</Text>
              )}
            </View>
            <Text style={styles.seriesTitle}>{series.title}</Text>
          </View>
        ) : null}

        {loading && !data ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <>
            <ChartBars
              points={barPoints}
              color={series.color}
              emptyLabel={`No ${series.title.toLowerCase()} yet`}
            />

            {filterId === ALL_FILTER && byGroup.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>By group</Text>
                {byGroup.map((g) => (
                  <GroupRow
                    key={g.uuid ?? g.key ?? g.name}
                    group={g}
                    onPress={() => {
                      const id = g.key || g.uuid;
                      if (id) setFilterId(id);
                    }}
                  />
                ))}
              </View>
            ) : null}

            {showTogether && together ? (
              <TogetherCard
                togetherCount={together.together_count}
                aloneCount={together.alone_count}
                hasPartner={hasPartner}
              />
            ) : null}

            {categories.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>By category</Text>
                <CategoryBreakdown rows={categories} />
              </View>
            ) : null}

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Goals {goalPeriod === "weekly" ? "this week" : "this month"}
                </Text>
                <Pressable onPress={() => router.push("/(tabs)/goals")} hitSlop={8}>
                  <Text style={styles.link}>
                    {goals.length ? "See all" : "Set a goal"}
                  </Text>
                </Pressable>
              </View>
              {goals.length ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.pills}
                >
                  {goals.map((goal) => (
                    <GoalHealthPill
                      key={goal.uuid}
                      goal={goal}
                      onPress={() => router.push("/(tabs)/goals")}
                    />
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.quiet}>
                  {filterId === ALL_FILTER
                    ? "No goals for this period yet."
                    : "No goals in this group for this period."}
                </Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function GroupRow({
  group,
  onPress,
}: {
  group: ChartGroup;
  onPress: () => void;
}) {
  const spend = Number(group.expense_total) || 0;
  const parts: string[] = [];
  if (spend) parts.push(formatSpendDelta(spend));
  else if (group.entry_count) {
    parts.push(
      `${group.entry_count} ${group.entry_count === 1 ? "entry" : "entries"}`
    );
  }
  const together = group.together_count;
  return (
    <Pressable onPress={onPress} style={styles.groupRow}>
      <Text style={styles.groupIcon}>{iconFor(group.icon)}</Text>
      <View style={styles.groupBody}>
        <Text style={styles.groupName}>
          {group.key === SPEND_GROUP_KEY ? "Spend" : group.name}
        </Text>
        {group.category_emojis?.length ? (
          <Text style={styles.groupEmojis} numberOfLines={1}>
            {group.category_emojis.slice(0, 8).join(" ")}
          </Text>
        ) : null}
      </View>
      <View style={styles.groupMeta}>
        {parts[0] ? (
          <Text
            style={[styles.groupTotal, spend > 0 && styles.bannerSpend]}
          >
            {parts[0]}
          </Text>
        ) : null}
        {together > 0 ? (
          <Text style={styles.togetherHint}>Together {together}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function TogetherCard({
  togetherCount,
  aloneCount,
  hasPartner,
}: {
  togetherCount: number;
  aloneCount: number;
  hasPartner: boolean;
}) {
  const total = Math.max(togetherCount + aloneCount, 1);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Together</Text>
      <Text style={styles.togetherCopy}>
        {hasPartner
          ? "Workouts and habits you logged with your partner vs on your own."
          : "Workouts and habits marked with a partner vs solo."}
      </Text>
      <SplitBar
        label="Together"
        count={togetherCount}
        total={total}
        color={colors.accentSoft}
      />
      <SplitBar
        label="Solo"
        count={aloneCount}
        total={total}
        color={colors.muted}
      />
    </View>
  );
}

function SplitBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const fill = Math.max(6, (count / total) * 100);
  return (
    <View style={styles.splitRow}>
      <Text style={styles.splitLabel}>{label}</Text>
      <View style={styles.splitTrack}>
        <View
          style={[
            styles.splitFill,
            { width: `${count ? fill : 0}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={[styles.splitCount, { color }]}>{count}</Text>
    </View>
  );
}

function CategoryBreakdown({
  rows,
}: {
  rows: { cat: ChartCategory; display: ReturnType<typeof categoryDisplay> }[];
}) {
  const max = Math.max(...rows.map((r) => r.display.value), 1);
  return (
    <View style={styles.catList}>
      {rows.map(({ cat, display }) => {
        const name = chartCategoryName(cat);
        const together = cat.together_count || 0;
        return (
          <View key={cat.uuid || cat.category__uuid || name} style={styles.catRow}>
            <View style={styles.catTop}>
              <Text style={styles.catEmoji}>
                {categoryGlyph({
                  emoji: cat.emoji,
                  icon: cat.icon,
                  name,
                })}
              </Text>
              <Text style={styles.catName} numberOfLines={1}>
                {name}
              </Text>
              <Text
                style={[styles.catValue, display.spendish && styles.bannerSpend]}
              >
                {display.label}
              </Text>
            </View>
            <View style={styles.catTrack}>
              <View
                style={[
                  styles.catFill,
                  {
                    width: `${Math.max(4, (display.value / max) * 100)}%`,
                    backgroundColor: display.spendish
                      ? colors.danger
                      : colors.accent,
                  },
                ]}
              />
            </View>
            {together > 0 ? (
              <Text style={styles.togetherHint}>
                Together {together}
                {cat.alone_count
                  ? ` · solo ${cat.alone_count}`
                  : ""}
              </Text>
            ) : null}
          </View>
        );
      })}
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
    marginBottom: 14,
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
    gap: 8,
    paddingBottom: 14,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.22)",
  },
  chipText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.muted,
  },
  chipTextOn: {
    color: colors.text,
  },
  banner: {
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  bannerText: {
    gap: 2,
  },
  bannerLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
  },
  bannerValue: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.accentSoft,
  },
  bannerSpend: {
    color: colors.danger,
  },
  bannerQuiet: {
    fontSize: 14,
    color: colors.muted,
  },
  seriesTitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.muted,
  },
  error: {
    marginTop: 12,
    color: colors.danger,
  },
  section: {
    marginTop: 22,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.accentSoft,
  },
  link: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.accentSoft,
  },
  quiet: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  pills: {
    gap: 8,
    paddingVertical: 2,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  groupIcon: {
    fontSize: 22,
    width: 28,
    textAlign: "center",
  },
  groupBody: {
    flex: 1,
    gap: 2,
  },
  groupName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  groupEmojis: {
    fontSize: 13,
  },
  groupMeta: {
    alignItems: "flex-end",
  },
  groupTotal: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  togetherHint: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.accentSoft,
  },
  togetherCopy: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  splitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  splitLabel: {
    width: 72,
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  splitTrack: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.elevated,
    overflow: "hidden",
  },
  splitFill: {
    height: 10,
    borderRadius: 999,
  },
  splitCount: {
    width: 28,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "700",
  },
  catList: {
    gap: 12,
  },
  catRow: {
    gap: 6,
  },
  catTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  catEmoji: {
    fontSize: 18,
    width: 24,
    textAlign: "center",
  },
  catName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  catValue: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  catTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.elevated,
    overflow: "hidden",
  },
  catFill: {
    height: 8,
    borderRadius: 999,
  },
});
