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

/** Units offered for Follow-up / custom groups. */
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
    type: "habit",
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
    id: "boolean",
    label: "Yes / No",
    chip: "Yes/No",
    unit: "count",
    metric_kind: "boolean",
    type: "habit",
  },
];

export function unitOptionsForGroupKey(groupKey: string | null | undefined): UnitOption[] {
  if (groupKey === SPEND_GROUP_KEY) return SPEND_UNIT_OPTIONS;
  return GENERAL_UNIT_OPTIONS;
}
