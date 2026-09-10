import type { Category } from "@/src/types/api";
import { formatGoalNumber } from "@/src/lib/goalMode";

/** Short label for quantity units in inputs and headlines. */
export function quantityUnitLabel(unit?: string | null): string {
  switch (unit) {
    case "minutes":
      return "min";
    case "miles":
      return "mi";
    case "km":
    case "kilometers":
      return "km";
    case "sessions":
      return "sessions";
    case "reps":
      return "reps";
    case "pages":
      return "pages";
    case "glasses":
      return "glasses";
    case "count":
      return "";
    default:
      return unit?.trim() ?? "";
  }
}

export function categoryKindLabel(cat: {
  metric_kind: Category["metric_kind"];
  unit?: string | null;
}): string {
  if (cat.metric_kind === "amount") return "Money";
  if (cat.metric_kind === "boolean") return "Yes / No";
  switch (cat.unit) {
    case "minutes":
      return "Minutes";
    case "miles":
      return "Miles";
    case "km":
    case "kilometers":
      return "Kilometers";
    case "sessions":
      return "Sessions";
    case "reps":
      return "Reps";
    case "pages":
      return "Pages";
    case "glasses":
      return "Glasses";
    case "count":
      return "Count";
    default:
      return quantityUnitLabel(cat.unit);
  }
}

export function formatQuantity(
  raw: string | number,
  unit?: string | null
): string {
  const n = formatGoalNumber(raw, "quantity");
  const label = quantityUnitLabel(unit);
  return label ? `${n} ${label}` : n;
}

export function formatCategoryValue(
  raw: string | number,
  cat: { metric_kind: Category["metric_kind"]; unit?: string | null }
): string {
  if (cat.metric_kind === "amount") return formatGoalNumber(raw, "amount");
  if (cat.metric_kind === "boolean") return formatGoalNumber(raw, "boolean");
  return formatQuantity(raw, cat.unit);
}
