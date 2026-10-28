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
  sublabel?: string;
  value: number;
  display: string;
  segments?: ChartBarSegment[];
  dim?: boolean;
  today?: boolean;
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
  const roomy = points.length <= 7;
  const barMax = roomy ? 120 : 140;
  const showValueLabels = points.length <= 16;

  return (
    <View style={styles.card}>
      <View style={[styles.row, roomy && styles.rowRoomy]}>
        {points.map((p) => {
          const height = p.value > 0 ? Math.max(8, (p.value / max) * barMax) : 4;
          const segments = (p.segments ?? []).filter((s) => s.value > 0);
          const segTotal = segments.reduce((s, seg) => s + seg.value, 0);
          const textTone = [
            p.dim && styles.dimmed,
            p.today && styles.todayText,
          ];
          return (
            <View key={p.key} style={[styles.col, roomy && styles.colRoomy]}>
              <Text
                style={[styles.value, roomy && styles.valueRoomy, ...textTone]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
              >
                {showValueLabels && p.value > 0
                  ? p.display
                  : p.value === max
                    ? p.display
                    : ""}
              </Text>
              <View style={[styles.bar, roomy && styles.barRoomy, { height }]}>
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
                    style={[
                      styles.solid,
                      {
                        backgroundColor: p.value > 0 ? color : colors.border,
                      },
                    ]}
                  />
                )}
              </View>
              <Text
                style={[styles.label, roomy && styles.labelRoomy, ...textTone]}
                numberOfLines={1}
              >
                {p.label}
              </Text>
              {p.sublabel ? (
                <Text style={[styles.sublabel, ...textTone]} numberOfLines={1}>
                  {p.sublabel}
                </Text>
              ) : null}
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
  rowRoomy: {
    height: 204,
    gap: 6,
  },
  col: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: 1,
  },
  colRoomy: {
    marginHorizontal: 0,
  },
  value: {
    marginBottom: 4,
    minHeight: 14,
    fontSize: 9,
    fontWeight: "700",
    color: colors.muted,
  },
  valueRoomy: {
    minHeight: 16,
    fontSize: 12,
    color: colors.text,
  },
  bar: {
    width: "100%",
    maxWidth: 28,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  barRoomy: {
    maxWidth: 36,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
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
  labelRoomy: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
  },
  sublabel: {
    marginTop: 1,
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  dimmed: {
    opacity: 0.4,
  },
  todayText: {
    color: colors.accentSoft,
  },
});
