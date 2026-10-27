import type { CategoryType, MetricKind } from "@/src/types/api";
import { SPEND_GROUP_KEY } from "@/src/types/api";

export type UnitOption = {
  id: string;
  label: string;
  unit: string;
  metric_kind: MetricKind;
  type: CategoryType;
  /** Short chip label */
  chip: string;
};

/** Units offered when adding to Spend (money only). */
export const SPEND_UNIT_OPTIONS: UnitOption[] = [
  {
    id: "usd",
    label: "US Dollar",
    chip: "$ USD",
    unit: "usd",
    metric_kind: "amount",
    type: "finance_expense",
  },
];

/** Units offered for Health / custom groups. */
export const GENERAL_UNIT_OPTIONS: UnitOption[] = [
  {
    id: "usd",
    label: "Money (USD)",
    chip: "$ USD",
    unit: "usd",
    metric_kind: "amount",
    type: "finance_expense",
  },
  {
    id: "minutes",
    label: "Minutes",
    chip: "min",
    unit: "minutes",
    metric_kind: "quantity",
    type: "fitness",
  },
  {
    id: "hours",
    label: "Hours",
    chip: "hr",
    unit: "hours",
    metric_kind: "quantity",
    type: "fitness",
  },
  {
    id: "sessions",
    label: "Sessions",
    chip: "sessions",
    unit: "sessions",
    metric_kind: "quantity",
    type: "fitness",
  },
  {
    id: "km",
    label: "Kilometers",
    chip: "km",
    unit: "km",
    metric_kind: "quantity",
    type: "fitness",
  },
  {
    id: "miles",
    label: "Miles",
    chip: "mi",
    unit: "miles",
    metric_kind: "quantity",
    type: "fitness",
  },
  {
    id: "reps",
    label: "Reps",
    chip: "reps",
    unit: "reps",
    metric_kind: "quantity",
    type: "fitness",
  },
  {
    id: "steps",
    label: "Steps",
    chip: "steps",
    unit: "steps",
    metric_kind: "quantity",
    type: "fitness",
  },
  {
    id: "lbs",
    label: "Pounds",
    chip: "lbs",
    unit: "lbs",
    metric_kind: "quantity",
    type: "fitness",
  },
  {
    id: "oz",
    label: "Ounces",
    chip: "oz",
    unit: "oz",
    metric_kind: "quantity",
    type: "habit",
  },
  {
    id: "kg",
    label: "Kilograms",
    chip: "kg",
    unit: "kg",
    metric_kind: "quantity",
    type: "fitness",
  },
  {
    id: "grams",
    label: "Grams",
    chip: "g",
    unit: "grams",
    metric_kind: "quantity",
    type: "habit",
  },
  {
    id: "count",
    label: "Count",
    chip: "count",
    unit: "count",
    metric_kind: "quantity",
    type: "habit",
  },
  {
    id: "pages",
    label: "Pages",
    chip: "pages",
    unit: "pages",
    metric_kind: "quantity",
    type: "habit",
  },
  {
    id: "glasses",
    label: "Glasses of water",
    chip: "glasses",
    unit: "glasses",
    metric_kind: "quantity",
    type: "habit",
  },
  {
    id: "cups",
    label: "Cups",
    chip: "cups",
    unit: "cups",
    metric_kind: "quantity",
    type: "habit",
  },
  {
    id: "servings",
    label: "Servings",
    chip: "servings",
    unit: "servings",
    metric_kind: "quantity",
    type: "habit",
  },
  {
    id: "calories",
    label: "Calories",
    chip: "cal",
    unit: "calories",
    metric_kind: "quantity",
    type: "habit",
  },
  {
    id: "ml",
    label: "Milliliters",
    chip: "ml",
    unit: "ml",
    metric_kind: "quantity",
    type: "habit",
  },
  {
    id: "boolean",
    label: "Did / Did not",
    chip: "Did/Not",
    unit: "count",
    metric_kind: "boolean",
    type: "habit",
  },
];

export function unitOptionsForGroupKey(groupKey: string | null | undefined): UnitOption[] {
  if (groupKey === SPEND_GROUP_KEY) return SPEND_UNIT_OPTIONS;
  return GENERAL_UNIT_OPTIONS;
}
