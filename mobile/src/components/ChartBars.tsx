import { Text, View } from "react-native";

import type { ChartPoint } from "@/src/types/api";

type Props = {
  points: ChartPoint[];
  period: "daily" | "weekly";
};

export function ChartBars({ points, period }: Props) {
  if (!points.length) {
    return (
      <View className="items-center rounded-2xl border border-night-border bg-night-surface py-12">
        <Text className="text-night-muted">No chart data yet</Text>
      </View>
    );
  }

  const values = points.map((p) => Number(p.expense_total) || 0);
  const max = Math.max(...values, 1);

  return (
    <View className="rounded-2xl border border-night-border bg-night-surface p-4">
      <View className="h-44 flex-row items-end justify-between">
        {points.map((p, i) => {
          const value = values[i];
          const height = Math.max(4, (value / max) * 140);
          const label =
            period === "weekly"
              ? (p.week_start ?? "").slice(5)
              : (p.date ?? "").slice(8);
          return (
            <View key={`${label}-${i}`} className="mx-0.5 flex-1 items-center">
              <Text className="mb-1 text-[10px] text-night-muted">
                {value > 0 ? value.toFixed(0) : ""}
              </Text>
              <View
                className="w-full max-w-[28px] rounded-t-md bg-accent"
                style={{ height }}
              />
              <Text className="mt-2 text-[10px] text-night-muted">{label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
