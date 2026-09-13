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
  membership?: Membership | null;
};

export type MembershipStatus = "trial" | "active" | "complimentary" | "expired";

export type Membership = {
  status: MembershipStatus;
  is_active: boolean;
  plan: "monthly" | "yearly" | null;
  source: "trial" | "store" | "complimentary" | "none";
  trial_ends_at: string | null;
  expires_at: string | null;
  auto_renewing: boolean;
  covers_couple: boolean;
  product_id: string | null;
};

export type BillingProduct = {
  id: string;
  plan: "monthly" | "yearly";
  price: string;
  period: "month" | "year";
  label: string;
  trial_days: number;
};

export type BillingResponse = {
  membership: Membership;
  products: BillingProduct[];
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
  category_unit?: string;
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

export type CompletedWith = "alone" | "with_partner";

export type RitualItem = {
  category_uuid: string;
  amount?: string;
  quantity?: string;
  label?: string;
  notes?: string;
  completed_with?: CompletedWith;
};

export type RitualRequest = {
  date: string;
  reflection?: string | null;
  favorite_moment?: string | null;
  /** Mood string (emoji); max 32. Send `""` to clear. */
  mood?: string | null;
  status?: "draft" | "completed";
  /** When true, entries omitted from `items` are deleted for that date. */
  replace_items?: boolean;
  items?: RitualItem[];
};

export type RitualEntry = {
  id: number;
  uuid?: string;
  category: number;
  category_uuid?: string;
  category_detail?: Category;
  date: string;
  amount?: string | null;
  quantity?: string | null;
  label?: string;
  notes?: string;
  completed_with?: CompletedWith;
};

export type NightCap = {
  uuid: string;
  date: string;
  reflection: string;
  favorite_moment?: string;
  has_favorite_photo?: boolean;
  favorite_photo_url?: string | null;
  mood: string;
  status: "draft" | "completed";
  completed_at: string | null;
  updated_at?: string;
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

export type SharedRitualHint = {
  category_uuid: string;
  partner_username: string;
  metric_kind: MetricKind;
  unit: string;
  amount: string | null;
  quantity: string | null;
  completed_with?: CompletedWith;
};

export type SharedRitualResponse = {
  date: string;
  partner_username: string | null;
  shared_category_uuids: string[];
  entries: SharedRitualHint[];
};

/** Per-category totals inside a calendar group day. */
export type CalendarCategorySummary = {
  name: string;
  emoji: string;
  unit: string;
  metric_kind: MetricKind;
  type: CategoryType;
  amount: string;
  quantity: string;
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
  categories?: CalendarCategorySummary[];
};

export type CalendarDay = {
  date: string;
  has_entries: boolean;
  has_reflection: boolean;
  has_nightcap?: boolean;
  nightcap_status?: string | null;
  /** NightCap mood emoji/string for the day (may be empty). */
  mood?: string;
  has_favorite_photo?: boolean;
  favorite_moment?: string;
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

export type ChartQuantityUnit = {
  unit: string;
  total: string;
};

export type ChartPointCategory = {
  uuid: string;
  name: string;
  emoji?: string;
  icon?: string;
  type?: CategoryType;
  metric_kind?: MetricKind;
  unit?: string;
  entry_count: number;
  amount: string;
  quantity: string;
  together_count?: number;
  alone_count?: number;
};

export type ChartPoint = {
  date?: string | null;
  week_start?: string | null;
  entry_count: number;
  expense_total: string;
  income_total: string;
  together_count?: number;
  alone_count?: number;
  quantity_by_unit?: ChartQuantityUnit[];
  by_category?: ChartPointCategory[];
};

export type ChartCategory = {
  category_id?: number;
  uuid?: string;
  name?: string;
  emoji?: string;
  icon?: string;
  type?: CategoryType;
  metric_kind?: MetricKind;
  unit?: string;
  group_uuid?: string | null;
  group_key?: string | null;
  group_name?: string | null;
  entry_count: number;
  amount_total: string;
  quantity_total: string;
  together_count?: number;
  alone_count?: number;
  yours_amount?: string;
  yours_quantity?: string;
  yours_entry_count?: number;
  category__uuid?: string;
  category__name?: string;
  category__type?: string;
};

export type ChartGroup = {
  uuid: string | null;
  key: string | null;
  name: string;
  icon: string;
  entry_count: number;
  expense_total: string;
  amount_total: string;
  quantity_total: string;
  together_count: number;
  alone_count: number;
  category_emojis: string[];
};

export type ChartTogether = {
  together_count: number;
  alone_count: number;
};

export type ChartResponse = {
  period: "daily" | "weekly";
  start_date: string;
  end_date: string;
  points: ChartPoint[];
  by_category: ChartCategory[];
  by_group?: ChartGroup[];
  together?: ChartTogether;
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

export type RecapKind = "month" | "year";

export type RecapSlideType =
  | "cover"
  | "stat"
  | "photos"
  | "moments"
  | "logged"
  | "moods"
  | "together"
  | "season"
  | "close";

export type RecapPhoto = {
  date: string;
  favorite_moment: string;
  mood: string;
  photo_url: string | null;
};

export type RecapMoment = {
  date: string;
  text: string;
  mood: string;
  has_photo: boolean;
  photo_url?: string | null;
};

export type RecapMood = {
  mood: string;
  count: number;
};

export type RecapCategoryRollup = {
  name: string;
  emoji: string;
  icon: string;
  type: CategoryType;
  metric_kind: MetricKind;
  unit: string;
  entry_count: number;
  amount: string;
  quantity: string;
};

export type RecapSlide = {
  type: RecapSlideType;
  eyebrow?: string;
  title?: string;
  body?: string;
  stat?: string;
  label?: string;
  season_key?: string;
  photos?: RecapPhoto[];
  moments?: RecapMoment[];
  moods?: RecapMood[];
  categories?: RecapCategoryRollup[];
  expense_total?: string;
};

export type RecapSnapshot = {
  start_date: string;
  end_date: string;
  day_count: number;
  nights_logged: number;
  nights_completed: number;
  photo_count: number;
  photos: RecapPhoto[];
  moments: RecapMoment[];
  moods: RecapMood[];
  categories: RecapCategoryRollup[];
  expense_total: string;
  income_total: string;
  habit_days: number;
  together_days: number;
};

export type RecapSeason = RecapSnapshot & {
  key: string;
  name: string;
  tagline: string;
};

export type RecapMonthResponse = {
  kind: "month";
  year: number;
  month: number;
  title: string;
  snapshot: RecapSnapshot;
  slides: RecapSlide[];
};

export type RecapYearResponse = {
  kind: "year";
  year: number;
  title: string;
  snapshot: RecapSnapshot;
  seasons: RecapSeason[];
  slides: RecapSlide[];
};

export type RecapMonthSummary = {
  year: number;
  month: number;
  nights_logged: number;
  title: string;
};

export type RecapYearSummary = {
  year: number;
  nights_logged: number;
  title: string;
};

export type RecapIndexResponse = {
  highlight_days: number;
  featured_month: RecapMonthSummary | null;
  featured_year: RecapYearSummary | null;
  months: RecapMonthSummary[];
  years: RecapYearSummary[];
};

export const SPEND_GROUP_KEY = "daily_spend";
/** Stable key for the default Health group. */
export const FOLLOW_UP_GROUP_KEY = "follow_up";
