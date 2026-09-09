import type { GoalHealth, GoalMode, GroupGoalItem } from "@/src/types/goals";
import { formatCurrency } from "@/src/utils/date";

export function uiHealth(health: GoalHealth | "behind"): GoalHealth {
  if (health === "behind") return "close";
  return health;
}

export function healthStyle(health: GoalHealth): { label: string; color: string } {
  switch (health) {
    case "healthy":
      return { label: "On track", color: "#2DD4BF" };
    case "close":
      return { label: "Close", color: "#FBBF24" };
    case "passed":
      return { label: "Done", color: "#34D399" };
    case "over":
      return { label: "Over", color: "#F87171" };
  }
}

export function formatGoalNumber(
  raw: string | number,
  kind: "amount" | "quantity" | "boolean" | "plain" = "plain"
): string {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  if (kind === "amount") return formatCurrency(n);
  if (kind === "boolean") return String(Math.round(n));
  if (n % 1 !== 0) return String(Math.round(n * 10) / 10);
  return String(Math.round(n));
}

export function modeShortLabel(mode: GoalMode): string {
  switch (mode) {
    case "stay_under":
      return "Stay under";
    case "pass":
      return "Pass";
    case "completed":
      return "Done";
  }
}

export function modePillLabel(goal: GroupGoalItem): string {
  if (goal.mode === "completed") {
    const n = formatGoalNumber(goal.target_value, "boolean");
    return `Done ${n}×`;
  }
  return modeShortLabel(goal.mode);
}

export function clampPercent(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
}
