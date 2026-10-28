export type GoalPeriod = "weekly" | "monthly";

export type GoalMode = "stay_under" | "pass" | "completed";

/** UI-facing health. API may also send `"behind"` — map that away in the UI. */
export type GoalHealth = "healthy" | "close" | "passed" | "over";

export type GoalHealthCounts = {
  total: number;
  healthy: number;
  close: number;
  behind: number;
  passed: number;
  over: number;
  stay_under?: number;
  pass?: number;
  completed?: number;
};

export type ModeMetrics = {
  goal_count: number;
  target_total: string;
  current_total: string;
  remaining_total: string;
  percent_used: number;
  healthy?: number;
  close?: number;
  behind?: number;
  passed?: number;
  over?: number;
};

export type GoalMetrics = {
  stay_under: ModeMetrics;
  pass: ModeMetrics;
  completed: ModeMetrics;
  target_total: string;
  current_total: string;
  remaining_total: string;
  percent_used: number;
  avg_percent_used: number;
};

export type GroupGoalCategory = {
  uuid: string;
  name: string;
  emoji: string;
  icon: string;
  metric_kind: "amount" | "quantity" | "boolean";
  unit: string;
};

export type GroupGoalItem = {
  uuid: string;
  id: number;
  display_name: string;
  mode: GoalMode;
  health: GoalHealth | "behind";
  period: "daily" | "weekly" | "monthly";
  rolls_into_month?: boolean;
  base_target_value?: string | null;
  direction?: "max" | "min";
  target_value: string;
  current_value: string;
  remaining_value: string;
  percent_used: number;
  period_start: string;
  period_end: string;
  scope?: "personal" | "shared";
  category: GroupGoalCategory;
};

export type CategoryGroupGoalBucket = {
  uuid: string | null;
  key: string | null;
  name: string;
  icon: string;
  counts: GoalHealthCounts;
  metrics?: GoalMetrics;
  goals: GroupGoalItem[];
};

export type GroupGoalSummary = {
  period: GoalPeriod | null;
  reference_date: string;
  counts: GoalHealthCounts;
  metrics?: GoalMetrics;
  groups: CategoryGroupGoalBucket[];
};

export type SetGoalInput = {
  category_uuid: string;
  target_value: string;
  period: GoalPeriod | "daily";
  direction?: "max" | "min";
  scope?: "personal" | "shared";
};

export type PendingTogetherGoal = {
  id: number;
  uuid: string;
  display_name: string;
  category_name: string;
  category_emoji: string;
  category_icon: string;
  target_label: string;
  current_target_label?: string;
  period: "daily" | "weekly" | "monthly";
  kind?: "new" | "change";
  proposed_by_username: string;
  partner_username: string;
  status: "needs_you" | "waiting_on_partner";
};
