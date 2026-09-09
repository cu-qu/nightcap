import { Text, View } from "react-native";

import {
  colors,
  goalStatusColors,
  goalStatusLabels,
} from "@/src/theme/colors";
import type { GoalProgress } from "@/src/types/api";

type Props = {
  goal: GoalProgress;
};

export function GoalProgressCard({ goal }: Props) {
  const tone = goalStatusColors[goal.status_label] ?? colors.muted;
  const label = goalStatusLabels[goal.status_label] ?? goal.status_label;
  const pct = Math.min(100, Math.max(0, goal.percent_used));

  return (
    <View className="mb-4 rounded-2xl border border-night-border bg-night-surface p-4">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="flex-1 text-lg font-semibold text-night-text">
          {goal.category_name}
        </Text>
        <View
          className="rounded-full px-3 py-1"
          style={{ backgroundColor: `${tone}33` }}
        >
          <Text style={{ color: tone }} className="text-xs font-semibold">
            {label}
          </Text>
        </View>
      </View>
      <Text className="mb-3 text-sm text-night-muted">
        {goal.current_value} / {goal.target_value} · {goal.period}
      </Text>
      <View className="h-2 overflow-hidden rounded-full bg-night-elevated">
        <View
          className="h-2 rounded-full"
          style={{ width: `${pct}%`, backgroundColor: tone }}
        />
      </View>
    </View>
  );
}
