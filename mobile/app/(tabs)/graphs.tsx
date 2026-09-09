import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { fetchCharts } from "@/src/api/charts";
import { ChartBars } from "@/src/components/ChartBars";
import { Screen } from "@/src/components/PrimaryButton";
import { colors } from "@/src/theme/colors";
import type { ChartPoint } from "@/src/types/api";

export default function GraphsScreen() {
  const [period, setPeriod] = useState<"daily" | "weekly">("daily");
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: "daily" | "weekly") => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCharts(p);
      setPoints(data.points);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load charts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [period, load]);

  return (
    <Screen>
      <ScrollView contentContainerClassName="px-5 py-4">
        <Text className="mb-4 text-base text-night-muted">
          Expense totals by day or week.
        </Text>

        <View className="mb-6 flex-row rounded-2xl border border-night-border bg-night-elevated p-1">
          {(["daily", "weekly"] as const).map((p) => (
            <Pressable
              key={p}
              onPress={() => setPeriod(p)}
              className={`flex-1 items-center rounded-xl py-3 ${
                period === p ? "bg-accent" : "bg-transparent"
              }`}
            >
              <Text
                className={`font-semibold capitalize ${
                  period === p ? "text-white" : "text-night-muted"
                }`}
              >
                {p}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : error ? (
          <Text className="text-red-400">{error}</Text>
        ) : (
          <ChartBars points={points} period={period} />
        )}
      </ScrollView>
    </Screen>
  );
}
