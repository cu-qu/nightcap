import type { Category } from "@/src/types/api";
import {
  FOLLOW_UP_ICON_KEYS,
  SPEND_ICON_KEYS,
} from "@/src/theme/iconMap";

function sortByIconOrder(list: Category[], order: readonly string[]) {
  return [...list].sort((a, b) => {
    const ai = order.indexOf(a.icon);
    const bi = order.indexOf(b.icon);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

/** Ordered NightCap walkthrough: spend chips → follow-up defaults → custom habits. */
export function getRitualCategoryQueue(categories: Category[]): Category[] {
  const spend = sortByIconOrder(
    categories.filter(
      (c) =>
        c.type === "finance_expense" ||
        (SPEND_ICON_KEYS as readonly string[]).includes(c.icon)
    ),
    SPEND_ICON_KEYS
  );

  const followUp = sortByIconOrder(
    categories.filter((c) =>
      (FOLLOW_UP_ICON_KEYS as readonly string[]).includes(c.icon)
    ),
    FOLLOW_UP_ICON_KEYS
  );

  const custom = categories
    .filter(
      (c) =>
        !c.is_default &&
        (c.type === "habit" || c.type === "custom" || c.type === "fitness") &&
        !(FOLLOW_UP_ICON_KEYS as readonly string[]).includes(c.icon) &&
        !(SPEND_ICON_KEYS as readonly string[]).includes(c.icon)
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const seen = new Set<string>();
  const queue: Category[] = [];
  for (const cat of [...spend, ...followUp, ...custom]) {
    if (seen.has(cat.uuid)) continue;
    seen.add(cat.uuid);
    queue.push(cat);
  }
  return queue;
}

export function isSpendCategory(cat: Category): boolean {
  return (
    cat.type === "finance_expense" ||
    (SPEND_ICON_KEYS as readonly string[]).includes(cat.icon)
  );
}

export function categoryPhaseLabel(cat: Category): string {
  if (isSpendCategory(cat)) return "Spend";
  if (cat.type === "finance_income") return "Invest";
  if (cat.type === "fitness") return "Move";
  return "Habit";
}

export function categoryUnitLabel(cat: Category): string {
  if (cat.metric_kind === "amount") return "USD";
  if (cat.unit === "minutes") return "minutes";
  if (cat.unit === "km") return "km";
  if (cat.metric_kind === "boolean") return "yes / no";
  return cat.unit || "count";
}

export function categoryInputPrefix(cat: Category): string | undefined {
  return cat.metric_kind === "amount" ? "$" : undefined;
}

export function categoryInputSuffix(cat: Category): string | undefined {
  if (cat.metric_kind === "amount" || cat.metric_kind === "boolean") return undefined;
  if (cat.unit === "minutes") return "min";
  if (cat.unit === "km") return "km";
  return cat.unit || undefined;
}
