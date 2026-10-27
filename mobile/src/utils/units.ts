import type { Category } from "@/src/types/api";
import { formatGoalNumber } from "@/src/lib/goalMode";

/** Short label for quantity units in inputs and headlines. */
export function quantityUnitLabel(unit?: string | null): string {
  switch (unit) {
    case "minutes":
      return "min";
    case "hours":
      return "hr";
    case "miles":
      return "mi";
    case "km":
    case "kilometers":
      return "km";
    case "sessions":
      return "sessions";
    case "reps":
      return "reps";
    case "steps":
      return "steps";
    case "lbs":
    case "pounds":
      return "lbs";
    case "oz":
    case "ounces":
      return "oz";
    case "kg":
    case "kilograms":
      return "kg";
    case "g":
    case "grams":
      return "g";
    case "calories":
    case "kcal":
      return "cal";
    case "servings":
      return "servings";
    case "cups":
      return "cups";
    case "ml":
    case "milliliters":
      return "ml";
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

/** Full name used in category details and chart titles. */
export function unitTitle(unit?: string | null): string {
  switch (unit) {
    case "minutes":
      return "Minutes";
    case "hours":
      return "Hours";
    case "miles":
      return "Miles";
    case "km":
    case "kilometers":
      return "Kilometers";
    case "sessions":
      return "Sessions";
    case "reps":
      return "Reps";
    case "steps":
      return "Steps";
    case "lbs":
    case "pounds":
      return "Pounds";
    case "oz":
    case "ounces":
      return "Ounces";
    case "kg":
    case "kilograms":
      return "Kilograms";
    case "g":
    case "grams":
      return "Grams";
    case "calories":
    case "kcal":
      return "Calories";
    case "servings":
      return "Servings";
    case "cups":
      return "Cups";
    case "ml":
    case "milliliters":
      return "Milliliters";
    case "pages":
      return "Pages";
    case "glasses":
      return "Glasses";
    case "count":
    case "":
    case null:
    case undefined:
      return "Count";
    default: {
      const label = quantityUnitLabel(unit);
      if (!label) return "Count";
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
  }
}

export function categoryKindLabel(cat: {
  metric_kind: Category["metric_kind"];
  unit?: string | null;
}): string {
  if (cat.metric_kind === "amount") return "Money";
  if (cat.metric_kind === "boolean") return "Did / Did not";
  return unitTitle(cat.unit);
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
