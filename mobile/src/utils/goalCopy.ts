/** Re-export shared helpers; SetGoalSheet intent helpers stay here. */
export {
  clampPercent,
  formatGoalNumber,
  healthStyle as healthPill,
  modeShortLabel,
  uiHealth,
} from "@/src/lib/goalMode";

import type { GoalMode, GroupGoalItem } from "@/src/types/goals";
import { formatCategoryValue } from "@/src/utils/units";

export function periodPhrase(period: GroupGoalItem["period"] | string): string {
  if (period === "weekly") return "per week";
  if (period === "monthly") return "per month";
  if (period === "daily") return "per day";
  return period;
}

function periodThis(period: GroupGoalItem["period"] | string): string {
  if (period === "weekly") return "this week";
  if (period === "monthly") return "this month";
  if (period === "daily") return "today";
  return periodPhrase(period);
}

export function isBooleanGoal(goal: GroupGoalItem): boolean {
  return goal.category.metric_kind === "boolean";
}

export function booleanGoalDidNot(goal: GroupGoalItem): boolean {
  return goal.mode === "stay_under" || goal.direction === "max";
}

function formatValue(goal: GroupGoalItem, raw: string): string {
  return formatCategoryValue(raw, goal.category);
}

export function goalHeadline(goal: GroupGoalItem): string {
  if (isBooleanGoal(goal)) {
    const span = periodThis(goal.period);
    return booleanGoalDidNot(goal) ? `Did not ${span}` : `Did ${span}`;
  }
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
  if (isBooleanGoal(goal)) {
    const did = Number(goal.current_value) >= 1;
    if (booleanGoalDidNot(goal)) return did ? "Did" : "Did not";
    return did ? "Did" : "Not yet";
  }
  const current = formatValue(goal, goal.current_value);
  const target = formatValue(goal, goal.target_value);
  const remaining = formatValue(goal, goal.remaining_value);
  if (goal.mode === "stay_under") {
    return `${current} used · ${remaining} left`;
  }
  return `${current} of ${target}`;
}

export type GoalIntent = "stay_under" | "reach" | "did" | "did_not";

export function directionForIntent(intent: GoalIntent): "max" | "min" {
  return intent === "stay_under" || intent === "did_not" ? "max" : "min";
}

export function intentForMode(mode: GoalMode): GoalIntent {
  return mode === "stay_under" ? "stay_under" : "reach";
}

export function intentForGoal(goal: GroupGoalItem): GoalIntent {
  if (isBooleanGoal(goal)) {
    return booleanGoalDidNot(goal) ? "did_not" : "did";
  }
  return intentForMode(goal.mode);
}

export function defaultIntentForMetricKind(
  metric: "amount" | "quantity" | "boolean"
): GoalIntent {
  if (metric === "boolean") return "did";
  return metric === "amount" ? "stay_under" : "reach";
}

/** Stored target for editing — not the month-scaled weekly display value. */
export function nativeTargetInput(goal: GroupGoalItem): string {
  const raw =
    goal.rolls_into_month && goal.base_target_value != null
      ? String(goal.base_target_value)
      : String(goal.target_value);
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return String(n);
}
