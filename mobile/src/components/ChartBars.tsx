import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/src/theme/colors";

export type ChartBarSegment = {
  key: string;
  value: number;
  color: string;
};

export type ChartBarDatum = {
  key: string;
  label: string;
  value: number;
  display: string;
  segments?: ChartBarSegment[];
};

type Props = {
  points: ChartBarDatum[];
  color?: string;
  emptyLabel?: string;
};

export function ChartBars({
  points,
  color = colors.accent,
  emptyLabel = "No chart data yet",
}: Props) {
  const hasValue = points.some((p) => p.value > 0);
  if (!points.length || !hasValue) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    );
  }

  const max = Math.max(...points.map((p) => p.value), 1);
  const showValueLabels = points.length <= 16;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {points.map((p) => {
          const height = Math.max(4, (p.value / max) * 140);
          const segments = (p.segments ?? []).filter((s) => s.value > 0);
          const segTotal = segments.reduce((s, seg) => s + seg.value, 0);
          return (
            <View key={p.key} style={styles.col}>
              <Text style={styles.value} numberOfLines={1}>
                {showValueLabels && p.value > 0
                  ? p.display
                  : p.value === max
                    ? p.display
                    : ""}
              </Text>
              <View style={[styles.bar, { height }]}>
                {p.value > 0 && segTotal > 0 ? (
                  stackHeights(segments, height).map((seg) => (
                    <View
                      key={seg.key}
                      style={{
                        height: seg.height,
                        width: "100%",
                        backgroundColor: seg.color,
                      }}
                    />
                  ))
                ) : (
                  <View
                    style={[styles.solid, { backgroundColor: color }]}
                  />
                )}
              </View>
              <Text style={styles.label}>{p.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function stackHeights(
  segments: ChartBarSegment[],
  height: number
): { key: string; color: string; height: number }[] {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (!total) return [];
  const rows = segments.map((seg) => ({
    key: seg.key,
    color: seg.color,
    height: Math.max(2, (seg.value / total) * height),
  }));
  const used = rows.reduce((s, r) => s + r.height, 0);
  const last = rows[rows.length - 1];
  if (last && used !== height) {
    last.height = Math.max(2, last.height + (height - used));
  }
  return rows;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 10,
  },
  empty: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 48,
    paddingHorizontal: 16,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
  },
  row: {
    height: 176,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  col: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: 1,
  },
  value: {
    marginBottom: 4,
    fontSize: 9,
    fontWeight: "700",
    color: colors.muted,
  },
  bar: {
    width: "100%",
    maxWidth: 28,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  solid: {
    flex: 1,
    width: "100%",
  },
  label: {
    marginTop: 6,
    fontSize: 9,
    color: colors.muted,
  },
});
