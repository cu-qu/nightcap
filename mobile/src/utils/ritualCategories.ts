import type { Category, SharedRitualHint } from "@/src/types/api";
import {
  FOLLOW_UP_ICON_KEYS,
  SPEND_ICON_KEYS,
} from "@/src/theme/iconMap";
import { formatCurrency } from "@/src/utils/date";
import { formatQuantity, quantityUnitLabel } from "@/src/utils/units";

function sortByIconOrder(list: Category[], order: readonly string[]) {
  return [...list].sort((a, b) => {
    const ai = order.indexOf(a.icon);
    const bi = order.indexOf(b.icon);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

/** Ordered NightCap walkthrough: spend chips → health defaults → custom habits. */
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

/** With Partner / Alone is for workouts and habits, not money. */
export function categorySupportsCompletedWith(cat: Category): boolean {
  if (cat.metric_kind === "amount") return false;
  if (cat.type === "finance_expense" || cat.type === "finance_income") {
    return false;
  }
  return true;
}

export function categoryPhaseLabel(cat: Category): string {
  if (isSpendCategory(cat)) return "Spend";
  if (cat.type === "finance_income") return "Invest";
  if (cat.type === "fitness") return "Move";
  return "Habit";
}

export function categoryUnitLabel(cat: Category): string {
  if (cat.metric_kind === "amount") return "USD";
  if (cat.metric_kind === "boolean") return "yes / no";
  return quantityUnitLabel(cat.unit) || cat.unit || "count";
}

export function categoryInputPrefix(cat: Category): string | undefined {
  return cat.metric_kind === "amount" ? "$" : undefined;
}

export function categoryInputSuffix(cat: Category): string | undefined {
  if (cat.metric_kind === "amount" || cat.metric_kind === "boolean") return undefined;
  return quantityUnitLabel(cat.unit) || cat.unit || undefined;
}

export function formatPartnerRitualValue(hint: SharedRitualHint): string {
  const name = hint.partner_username;
  const together =
    hint.metric_kind === "amount"
      ? ""
      : hint.completed_with === "with_partner"
        ? " with you"
        : hint.completed_with === "alone"
          ? " on their own"
          : "";
  if (hint.metric_kind === "amount") {
    const n = Number(hint.amount);
    if (!Number.isFinite(n)) return `${name} already logged this${together}`;
    return `${name} logged ${formatCurrency(n)}${together}`;
  }
  if (hint.metric_kind === "boolean") {
    const yes = Number(hint.quantity) >= 1;
    return `${name} said ${yes ? "yes" : "no"}${together}`;
  }
  const n = Number(hint.quantity);
  if (!Number.isFinite(n)) return `${name} already logged this${together}`;
  return `${name} logged ${formatQuantity(n, hint.unit)}${together}`;
}
