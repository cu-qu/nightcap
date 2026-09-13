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
  ALONE_COLOR,
  ALONE_FILTER,
  TOGETHER_COLOR,
  TOGETHER_FILTER,
  axisLabel,
  categoryColorId,
  categoryDisplay,
  categoryYoursDisplay,
  chartCategoryName,
  colorForCategory,
  formatBarValue,
  pointValue,
  segmentValue,
  seriesForFilter,
  uniqueCategoryColors,
} from "@/src/utils/chartMetrics";
import { monthLabel, todayIso, toIsoDate } from "@/src/utils/date";

export default function ChartsScreen() {
  const router = useRouter();
  const hasPartner = !!useAuthStore((s) => s.user?.partnership);
  const groups = useGroupsStore((s) => s.groups);
  const loadGroups = useGroupsStore((s) => s.load);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [period, setPeriod] = useState<"daily" | "weekly">("daily");
  const [filterId, setFilterId] = useState(ALL_FILTER);
  const [data, setData] = useState<ChartResponse | null>(null);
  const [goals, setGoals] = useState<GroupGoalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goalPeriod: GoalPeriod = period === "weekly" ? "weekly" : "monthly";
  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    const nextY = d.getFullYear();
    const nextM = d.getMonth() + 1;
    if (
      nextY > now.getFullYear() ||
      (nextY === now.getFullYear() && nextM > now.getMonth() + 1)
    ) {
      return;
    }
    setYear(nextY);
    setMonth(nextM);
  }

  const load = useCallback(
    async (p: "daily" | "weekly", groupId: string, y: number, m: number) => {
        setError(null);
        setData(null);
        try {
          const group =
            groupId === ALL_FILTER ||
            groupId === TOGETHER_FILTER ||
            groupId === ALONE_FILTER
              ? undefined
              : groupId;
          const start = `${y}-${String(m).padStart(2, "0")}-01`;
          const last = new Date(y, m, 0);
          const endIso = toIsoDate(last);
          const today = todayIso();
          const end = today < endIso && today >= start ? today : endIso;
          const withFilter =
            groupId === TOGETHER_FILTER
              ? "together"
              : groupId === ALONE_FILTER
                ? "alone"
                : undefined;
          const charts = await fetchCharts(p, {
            group,
            startDate: start,
            endDate: end,
            withFilter,
          });
          setData(charts);
          const current =
            y === new Date().getFullYear() && m === new Date().getMonth() + 1;
          if (!current) {
            setGoals([]);
            return;
          }
          try {
            const summary = await getGroupSummary(
              p === "weekly" ? "weekly" : "monthly"
            );
            const buckets = summary.groups ?? [];
            const allGoals = buckets.flatMap((g) => g.goals);
            const matching =
              groupId === ALL_FILTER
                ? allGoals
                : groupId === TOGETHER_FILTER
                  ? allGoals.filter((g) => g.scope === "shared")
                  : groupId === ALONE_FILTER
                    ? allGoals.filter((g) => g.scope !== "shared")
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
          await load(period, filterId, year, month);
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [period, filterId, year, month, load])
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load(period, filterId, year, month);
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
    if (hasPartner || (data?.together?.together_count || 0) + (data?.together?.alone_count || 0) > 0) {
      chips.push({ id: TOGETHER_FILTER, label: "Together" });
      chips.push({ id: ALONE_FILTER, label: "Solo" });
    }
    return chips;
  }, [groups, hasPartner, data?.together]);

  const series = useMemo(
    () => seriesForFilter(filterId, data?.points ?? []),
    [filterId, data]
  );

  const colorMap = useMemo(() => {
    const ids: string[] = [];
    for (const cat of data?.by_category ?? []) {
      ids.push(categoryColorId(cat));
    }
    for (const point of data?.points ?? []) {
      for (const seg of point.by_category ?? []) {
        ids.push(categoryColorId(seg));
      }
    }
    return uniqueCategoryColors(ids);
  }, [data]);

  const barPoints = useMemo(() => {
    const points = data?.points ?? [];
    return points.map((p, i) => {
      const iso = period === "weekly" ? p.week_start : p.date;
      const value = pointValue(p, series);
      const segments = (p.by_category ?? [])
        .map((seg) => {
          const id = categoryColorId(seg);
          return {
            key: id,
            value: segmentValue(seg, series),
            color: colorForCategory(id, colorMap),
          };
        })
        .filter((seg) => seg.value > 0)
        .sort((a, b) => a.value - b.value);
      return {
        key: iso || `${period}-${i}`,
        label: axisLabel(iso, period),
        value,
        display: formatBarValue(value, series),
        segments,
      };
    });
  }, [data, period, series, colorMap]);

  const togetherBarPoints = useMemo(() => {
    const points = data?.points ?? [];
    return points.map((p, i) => {
      const iso = period === "weekly" ? p.week_start : p.date;
      const togetherN = p.together_count || 0;
      const aloneN = p.alone_count || 0;
      const value = togetherN + aloneN;
      return {
        key: `with-${iso || `${period}-${i}`}`,
        label: axisLabel(iso, period),
        value,
        display: value ? String(value) : "",
        segments: [
          { key: ALONE_FILTER, value: aloneN, color: ALONE_COLOR },
          { key: TOGETHER_FILTER, value: togetherN, color: TOGETHER_COLOR },
        ].filter((s) => s.value > 0),
      };
    });
  }, [data, period]);

  const rangeLabel = monthLabel(year, month);

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
  const showTogetherChart =
    filterId !== TOGETHER_FILTER &&
    filterId !== ALONE_FILTER &&
    ((together?.together_count || 0) + (together?.alone_count || 0) > 0 ||
      (hasPartner && togetherBarPoints.some((p) => p.value > 0)));

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

  const legendItems = useMemo(() => {
    return categories
      .map(({ cat }) => {
        const id = categoryColorId(cat);
        const value = segmentValue(
          {
            amount: cat.amount_total,
            quantity: cat.quantity_total,
            entry_count: cat.entry_count,
            together_count: cat.together_count,
            alone_count: cat.alone_count,
            type: cat.type,
            metric_kind: cat.metric_kind,
            unit: cat.unit,
          },
          series
        );
        return {
          cat,
          id,
          value,
          color: colorForCategory(id, colorMap),
        };
      })
      .filter((item) => item.value > 0);
  }, [categories, series, colorMap]);

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
            <View style={styles.monthNav}>
              <Pressable onPress={() => shiftMonth(-1)} style={styles.navBtn}>
                <Text style={styles.navText}>‹</Text>
              </Pressable>
              <Text style={styles.bannerLabel}>{rangeLabel}</Text>
              <Pressable
                onPress={() => shiftMonth(1)}
                disabled={isCurrentMonth}
                style={[styles.navBtn, isCurrentMonth && styles.navBtnOff]}
              >
                <Text
                  style={[styles.navText, isCurrentMonth && styles.navTextOff]}
                >
                  ›
                </Text>
              </Pressable>
            </View>
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
              <Text style={styles.bannerQuiet}>
                {filterId === TOGETHER_FILTER
                  ? "No together activity in this range"
                  : filterId === ALONE_FILTER
                    ? "No solo activity in this range"
                    : "No activity in this range"}
              </Text>
            )}
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
              emptyLabel={
                filterId === TOGETHER_FILTER
                  ? "No together activity yet"
                  : filterId === ALONE_FILTER
                    ? "No solo activity yet"
                    : `No ${series.title.toLowerCase()} yet`
              }
            />
            {legendItems.length > 0 ? (
              <View style={styles.legend}>
                {legendItems.map((item) => (
                  <View key={item.id} style={styles.legendItem}>
                    <View
                      style={[styles.legendDot, { backgroundColor: item.color }]}
                    />
                    <Text style={styles.legendText} numberOfLines={1}>
                      {categoryGlyph({
                        emoji: item.cat.emoji,
                        icon: item.cat.icon,
                        name: chartCategoryName(item.cat),
                      })}{" "}
                      {chartCategoryName(item.cat)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {showTogetherChart ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Together vs solo</Text>
                <Text style={styles.togetherCopy}>
                  {hasPartner
                    ? "Workouts and habits with your partner vs on your own."
                    : "Workouts and habits marked with a partner vs solo."}
                </Text>
                {together &&
                together.together_count + together.alone_count > 0 ? (
                  <Text style={styles.togetherTotals}>
                    Together {together.together_count} · Solo{" "}
                    {together.alone_count}
                  </Text>
                ) : null}
                <ChartBars
                  points={togetherBarPoints}
                  color={TOGETHER_COLOR}
                  emptyLabel="No together or solo logs yet"
                />
                <View style={styles.legend}>
                  <View style={styles.legendItem}>
                    <View
                      style={[styles.legendDot, { backgroundColor: TOGETHER_COLOR }]}
                    />
                    <Text style={styles.legendText}>Together</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View
                      style={[styles.legendDot, { backgroundColor: ALONE_COLOR }]}
                    />
                    <Text style={styles.legendText}>Solo</Text>
                  </View>
                </View>
              </View>
            ) : null}

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

            {categories.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>By category</Text>
                <CategoryBreakdown
                  rows={categories}
                  colors={colorMap}
                  showYours={hasPartner}
                />
              </View>
            ) : null}

            {isCurrentMonth ? (
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
            ) : null}
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

function CategoryBreakdown({
  rows,
  colors: colorMap,
  showYours,
}: {
  rows: { cat: ChartCategory; display: ReturnType<typeof categoryDisplay> }[];
  colors: Map<string, string>;
  showYours?: boolean;
}) {
  const max = Math.max(...rows.map((r) => r.display.value), 1);
  return (
    <View style={styles.catList}>
      {rows.map(({ cat, display }) => {
        const name = chartCategoryName(cat);
        const together = cat.together_count || 0;
        const color = colorForCategory(categoryColorId(cat), colorMap);
        const yours = categoryYoursDisplay(cat);
        const yoursLine = showYours
          ? yours.value
            ? `By you ${yours.label}`
            : "None by you"
          : null;
        const splitYours = Boolean(
          showYours && display.value > 0 && yours.value !== display.value
        );
        return (
          <View key={cat.uuid || cat.category__uuid || name} style={styles.catRow}>
              <View style={styles.catTop}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: color },
                ]}
              />
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
                  styles.catFillRow,
                  { width: `${Math.max(4, (display.value / max) * 100)}%` },
                ]}
              >
                {splitYours ? (
                  <>
                    {yours.value > 0 ? (
                      <View
                        style={{
                          flex: yours.value,
                          backgroundColor: color,
                        }}
                      />
                    ) : null}
                    {display.value - yours.value > 0 ? (
                      <View
                        style={{
                          flex: display.value - yours.value,
                          backgroundColor: color,
                          opacity: 0.35,
                        }}
                      />
                    ) : null}
                  </>
                ) : together + (cat.alone_count || 0) > 0 ? (
                  <>
                    {together > 0 ? (
                      <View
                        style={{
                          flex: together,
                          backgroundColor: TOGETHER_COLOR,
                        }}
                      />
                    ) : null}
                    {(cat.alone_count || 0) > 0 ? (
                      <View
                        style={{
                          flex: cat.alone_count,
                          backgroundColor: ALONE_COLOR,
                        }}
                      />
                    ) : null}
                  </>
                ) : (
                  <View style={{ flex: 1, backgroundColor: color }} />
                )}
              </View>
            </View>
            {yoursLine ? (
              <Text style={styles.yoursHint}>{yoursLine}</Text>
            ) : together + (cat.alone_count || 0) > 0 ? (
              <Text style={styles.togetherHint}>
                Together {together}
                {cat.alone_count ? ` · solo ${cat.alone_count}` : ""}
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
    gap: 8,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  navBtn: {
    borderRadius: 12,
    backgroundColor: colors.elevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  navBtnOff: {
    opacity: 0.35,
  },
  navText: {
    color: colors.text,
    fontSize: 18,
  },
  navTextOff: {
    color: colors.muted,
  },
  bannerLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
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
  togetherTotals: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "48%",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
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
  yoursHint: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },
  togetherCopy: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
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
  catFillRow: {
    height: 8,
    flexDirection: "row",
    borderRadius: 999,
    overflow: "hidden",
  },
});
