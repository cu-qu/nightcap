export type MetricKind = "amount" | "quantity" | "boolean";

export type CategoryType =
  | "finance_expense"
  | "finance_income"
  | "fitness"
  | "habit"
  | "custom";

export type GoalStatusLabel = "on_track" | "at_risk" | "behind" | "reached";

export type Category = {
  id: number;
  uuid: string;
  group: number | null;
  group_uuid: string | null;
  group_key: string | null;
  name: string;
  type: CategoryType;
  metric_kind: MetricKind;
  unit: string;
  /** Stable client key for seeded defaults (e.g. groceries). */
  icon: string;
  /** Display emoji saved by the user (e.g. 🛒). Prefer this in UI. */
  emoji?: string;
  sort_order: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type CategoryGroup = {
  id: number;
  uuid: string;
  name: string;
  key: string;
  sort_order: number;
  icon: string;
  show_in_ritual: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  categories?: Category[];
};

export type RitualCategoryGroup = {
  id: number;
  uuid: string;
  name: string;
  key: string;
  sort_order: number;
  icon: string;
  show_in_ritual: boolean;
  categories: Category[];
};

export type User = {
  id: number | string;
  username: string;
  email: string;
  email_verified?: boolean;
  preferred_language?: string;
  onboarding_completed?: boolean;
  tracking_mode?: "solo" | "couple";
  partnership?: Partnership | null;
};

export type PartnershipMember = {
  id: string;
  username: string;
  email: string;
  role: "owner" | "partner";
};

export type Partnership = {
  uuid: string;
  invite_code: string;
  is_full: boolean;
  pending_email: string | null;
  members: PartnershipMember[];
};

export type GoalScope = "personal" | "shared";

export type GoalTemplateGroup = "finance" | "fitness" | "habit";

export type GoalTemplate = {
  slug: string;
  title: string;
  description: string;
  example_entry_label: string;
  category_name: string;
  category_type: CategoryType;
  category_icon: string;
  category_emoji: string;
  category_group_key: string;
  period: "daily" | "weekly" | "monthly";
  direction: "max" | "min";
  target_value: string;
  group: GoalTemplateGroup;
  audience: "personal" | "couple" | "both";
  suggested_scope: GoalScope;
  suggest_solo: boolean;
  suggest_couple: boolean;
  sort_order: number;
};

export type AuthTokens = {
  access: string;
  refresh: string;
};

export type RegisterResponse = AuthTokens & {
  user: User;
};

export type TokenResponse = AuthTokens;

export type RitualItem = {
  category_uuid: string;
  amount?: string;
  quantity?: string;
  label?: string;
  notes?: string;
};

export type RitualRequest = {
  date: string;
  reflection?: string | null;
  /** Mood string (emoji); max 32. Send `""` to clear. */
  mood?: string | null;
  status?: "draft" | "completed";
  items?: RitualItem[];
};

export type RitualEntry = {
  id: number;
  uuid?: string;
  category: number;
  category_uuid?: string;
  date: string;
  amount?: string | null;
  quantity?: string | null;
  label?: string;
  notes?: string;
};

export type NightCap = {
  uuid: string;
  date: string;
  reflection: string;
  mood: string;
  status: "draft" | "completed";
  completed_at: string | null;
  entries?: RitualEntry[];
};

export type RitualResponse = {
  date: string;
  reflection: string;
  mood?: string;
  nightcap?: NightCap;
  entries: RitualEntry[];
  summary: Record<string, unknown>;
};

/** Per-group activity summary returned on calendar days. */
export type CalendarGroupSummary = {
  uuid: string | null;
  key: string | null;
  name: string;
  icon: string;
  entry_count: number;
  expense_total: string;
  amount_total: string;
  quantity_total: string;
  category_emojis: string[];
};

export type CalendarDay = {
  date: string;
  has_entries: boolean;
  has_reflection: boolean;
  has_nightcap?: boolean;
  nightcap_status?: string | null;
  /** NightCap mood emoji/string for the day (may be empty). */
  mood?: string;
  entry_count: number;
  expense_total: string;
  habit_count: number;
  groups?: CalendarGroupSummary[];
};

export type CalendarResponse = {
  year: number;
  month: number;
  days: CalendarDay[];
};

export type ChartPoint = {
  date?: string | null;
  week_start?: string | null;
  entry_count: number;
  expense_total: string;
  income_total: string;
};

export type ChartResponse = {
  period: "daily" | "weekly";
  start_date: string;
  end_date: string;
  points: ChartPoint[];
  by_category: Record<string, unknown>[];
};

export type GoalProgress = {
  goal_id: number;
  goal_uuid: string | null;
  category_id: number;
  category_uuid: string | null;
  category_name: string;
  period: string;
  period_start: string;
  period_end: string;
  direction: string;
  target_value: string;
  current_value: string;
  remaining_value: string;
  percent_used: number;
  status: string;
  status_label: GoalStatusLabel;
  warn_at_percent: number;
};

export type CategoryCreateInput = {
  name: string;
  type: CategoryType;
  metric_kind?: MetricKind;
  unit?: string;
  /** Stable optional key (defaults/seeded icons). */
  icon?: string;
  /** Display emoji to store on the category (preferred for custom picks). */
  emoji?: string;
  group?: number | null;
  sort_order?: number;
};

export type CategoryUpdateInput = Partial<CategoryCreateInput>;

export type CategoryGroupCreateInput = {
  name: string;
  key: string;
  sort_order?: number;
  icon?: string;
  show_in_ritual?: boolean;
};

export type CategoryGroupUpdateInput = Partial<{
  name: string;
  key: string;
  sort_order: number;
  icon: string;
  show_in_ritual: boolean;
}>;

export const SPEND_GROUP_KEY = "daily_spend";
export const FOLLOW_UP_GROUP_KEY = "follow_up";
