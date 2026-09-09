/** Re-export shared helpers; SetGoalSheet intent helpers stay here. */
export {
  clampPercent,
  formatGoalNumber,
  healthStyle as healthPill,
  modeShortLabel,
  uiHealth,
} from "@/src/lib/goalMode";

import type { GoalMode, GroupGoalItem } from "@/src/types/goals";
import { formatGoalNumber } from "@/src/lib/goalMode";

export function periodPhrase(period: GroupGoalItem["period"] | string): string {
  if (period === "weekly") return "per week";
  if (period === "monthly") return "per month";
  if (period === "daily") return "per day";
  return period;
}

function formatValue(goal: GroupGoalItem, raw: string): string {
  return formatGoalNumber(raw, goal.category.metric_kind);
}

export function goalHeadline(goal: GroupGoalItem): string {
  const span = periodPhrase(goal.period);
  const target = formatValue(goal, goal.target_value);
  switch (goal.mode as GoalMode) {
    case "stay_under":
      return `Stay under ${target} ${span}`;
    case "pass":
      if (goal.category.metric_kind === "amount") {
        return `Reach ${target} ${span}`;
      }
      return `Pass ${target} ${span}`;
    case "completed":
      return `Complete ${target} times ${span}`;
  }
}

export function goalSubline(goal: GroupGoalItem): string {
  const current = formatValue(goal, goal.current_value);
  const target = formatValue(goal, goal.target_value);
  const remaining = formatValue(goal, goal.remaining_value);
  if (goal.mode === "stay_under") {
    return `${current} used · ${remaining} left`;
  }
  return `${current} of ${target}`;
}

export type GoalIntent = "stay_under" | "reach";

export function directionForIntent(intent: GoalIntent): "max" | "min" {
  return intent === "stay_under" ? "max" : "min";
}

export function defaultIntentForMetricKind(
  metric: "amount" | "quantity" | "boolean"
): GoalIntent {
  return metric === "amount" ? "stay_under" : "reach";
}
