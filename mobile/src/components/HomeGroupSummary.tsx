import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/src/theme/colors";
import { iconFor } from "@/src/theme/iconMap";
import type { GroupPeriodSummary } from "@/src/utils/groupSummary";
import { formatCurrency } from "@/src/utils/date";

type Props = {
  title: string;
  rangeLabel: string;
  totalSpend: number;
  groups: GroupPeriodSummary[];
  loading?: boolean;
};

export function HomeGroupSummary({
  title,
  rangeLabel,
  totalSpend,
  groups,
  loading,
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.range}>{rangeLabel}</Text>
        </View>
        <Text style={styles.total}>
          {loading ? "…" : formatCurrency(totalSpend)}
        </Text>
      </View>

      {loading ? (
        <Text style={styles.empty}>Loading groups…</Text>
      ) : groups.length === 0 ? (
        <Text style={styles.empty}>No group activity in this period yet.</Text>
      ) : (
        <View style={styles.list}>
          {groups.map((g) => (
            <View key={g.id} style={styles.row}>
              <Text style={styles.emoji}>{iconFor(g.icon)}</Text>
              <View style={styles.body}>
                <Text style={styles.name} numberOfLines={1}>
                  {g.name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {g.category_emojis.length
                    ? g.category_emojis.slice(0, 8).join(" ")
                    : `${g.entry_count} entries`}
                  {g.nights > 1 ? ` · ${g.nights} nights` : ""}
                </Text>
              </View>
              <Text style={styles.amount}>
                {g.expense_total > 0
                  ? formatCurrency(g.expense_total)
                  : g.quantity_total > 0
                    ? String(Math.round(g.quantity_total * 10) / 10)
                    : `${g.entry_count}`}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
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
  total: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.accentSoft,
  },
  empty: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  list: {
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  emoji: {
    fontSize: 22,
    width: 28,
    textAlign: "center",
  },
  body: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  meta: {
    marginTop: 2,
    fontSize: 13,
    color: colors.muted,
  },
  amount: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
});
