import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/src/theme/colors";
import { categoryGlyph, iconFor } from "@/src/theme/iconMap";
import type { GroupGoalItem } from "@/src/types/goals";
import { formatCurrency } from "@/src/utils/date";
import {
  goalHeadline,
  goalSubline,
  healthPill,
  uiHealth,
} from "@/src/utils/goalCopy";
import type { HomeGroupSection } from "@/src/utils/homeGroupSections";

type Props = {
  title: string;
  rangeLabel: string;
  /** Overall spend for the period (calendar). */
  periodSpend?: number;
  sections: HomeGroupSection[];
  loading?: boolean;
  onOpenGoals?: () => void;
};

function GoalMetricRow({ goal }: { goal: GroupGoalItem }) {
  const health = uiHealth(goal.health);
  const pill = healthPill(health);
  const pct = Math.min(100, Math.max(0, goal.percent_used));
  const isOver = health === "over" || goal.percent_used > 100;
  const fill = isOver ? 100 : pct;

  return (
    <View style={styles.goalCard}>
      <View style={styles.goalTop}>
        <Text style={styles.goalEmoji}>
          {categoryGlyph({
            emoji: goal.category.emoji,
            icon: goal.category.icon,
          })}
        </Text>
        <View style={styles.goalTitles}>
          <Text style={styles.goalName} numberOfLines={1}>
            {goal.display_name}
          </Text>
          <Text style={styles.goalHeadline} numberOfLines={2}>
            {goalHeadline(goal)}
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: `${pill.color}33` }]}>
          <Text style={[styles.pillText, { color: pill.color }]}>
            {pill.label}
          </Text>
        </View>
      </View>
      <Text style={styles.goalSub}>{goalSubline(goal)}</Text>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { width: `${fill}%`, backgroundColor: pill.color },
          ]}
        />
      </View>
      {isOver ? <Text style={styles.overHint}>over</Text> : null}
    </View>
  );
}

function GroupSectionCard({ section }: { section: HomeGroupSection }) {
  const act = section.activity;
  const spend = act?.expense_total ?? 0;
  const entries = act?.entry_count ?? 0;
  const nights = act?.nights ?? 0;
  const emojis = act?.category_emojis ?? [];
  const qty = act?.quantity_total ?? 0;

  return (
    <View style={styles.groupCard}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupEmoji}>{iconFor(section.icon)}</Text>
        <Text style={styles.groupName}>{section.name}</Text>
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
            <Text style={styles.statValue}>
              {Math.round(qty * 10) / 10}
            </Text>
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
        <Text style={styles.goalsLabel}>
          Goals
          {section.goalCounts.total
            ? ` · ${section.goalCounts.total}`
            : ""}
        </Text>
        {section.goals.length === 0 ? (
          <Text style={styles.noGoals}>No goals set for this group</Text>
        ) : (
          section.goals.map((goal) => (
            <GoalMetricRow key={goal.uuid} goal={goal} />
          ))
        )}
      </View>
    </View>
  );
}

export function HomeGoalsSummary({
  title,
  rangeLabel,
  periodSpend,
  sections,
  loading,
  onOpenGoals,
}: Props) {
  const goalTotal = sections.reduce((n, s) => n + s.goalCounts.total, 0);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.range}>{rangeLabel}</Text>
        </View>
        <View style={styles.headerRight}>
          {typeof periodSpend === "number" ? (
            <Text style={styles.periodSpend}>
              {loading ? "…" : formatCurrency(periodSpend)}
            </Text>
          ) : null}
          {goalTotal > 0 ? (
            <Text style={styles.goalMeta}>{goalTotal} goals</Text>
          ) : null}
        </View>
      </View>

      {loading ? (
        <Text style={styles.empty}>Loading groups…</Text>
      ) : sections.length === 0 ? (
        <Text style={styles.empty}>
          No active groups yet. Configure them in Settings → Categories & Groups.
        </Text>
      ) : (
        <View style={styles.sections}>
          {sections.map((section) => (
            <GroupSectionCard key={section.id} section={section} />
          ))}
        </View>
      )}

      {onOpenGoals ? (
        <Pressable onPress={onOpenGoals} style={styles.link} hitSlop={8}>
          <Text style={styles.linkText}>
            {goalTotal > 0 ? "Manage goals ›" : "Set a goal ›"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  headerText: {
    flex: 1,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  range: {
    marginTop: 4,
    fontSize: 13,
    color: colors.muted,
  },
  periodSpend: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.accentSoft,
  },
  goalMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },
  empty: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  sections: {
    gap: 12,
  },
  groupCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
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
    marginBottom: 2,
  },
  noGoals: {
    fontSize: 13,
    color: colors.muted,
  },
  goalCard: {
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: 10,
    gap: 6,
  },
  goalTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  goalEmoji: {
    fontSize: 20,
    marginTop: 1,
  },
  goalTitles: {
    flex: 1,
  },
  goalName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  goalHeadline: {
    marginTop: 2,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 16,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  goalSub: {
    fontSize: 12,
    color: colors.muted,
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
  overHint: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.danger,
    textTransform: "uppercase",
  },
  link: {
    marginTop: 14,
    alignSelf: "flex-start",
  },
  linkText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.accentSoft,
  },
});
