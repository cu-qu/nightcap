import type {
  CalendarCategorySummary,
  CalendarDay,
  CalendarGroupSummary,
} from "@/src/types/api";
import { SPEND_GROUP_KEY } from "@/src/types/api";
import { formatGoalNumber } from "@/src/lib/goalMode";
import { formatQuantity, quantityUnitLabel } from "@/src/utils/units";

export const ALL_FILTER = "all";

const UNIT_ORDER = [
  "minutes",
  "miles",
  "km",
  "sessions",
  "reps",
  "pages",
  "glasses",
  "count",
];

export function groupFilterId(g: { key?: string | null; uuid?: string | null }): string {
  return g.key || g.uuid || "";
}

export function groupMatchesFilter(
  g: CalendarGroupSummary,
  filterId: string
): boolean {
  if (filterId === ALL_FILTER) return true;
  return g.key === filterId || g.uuid === filterId;
}

export function groupsForFilter(
  day: CalendarDay | null | undefined,
  filterId: string
): CalendarGroupSummary[] {
  const groups = day?.groups ?? [];
  if (filterId === ALL_FILTER) return groups;
  return groups.filter((g) => groupMatchesFilter(g, filterId));
}

export function formatSpendDelta(amount: number): string {
  if (!amount) return "";
  const n = Math.abs(amount);
  const body = Number.isInteger(n) || Math.abs(n - Math.round(n)) < 0.005
    ? `$${Math.round(n)}`
    : `$${n.toFixed(2)}`;
  return `-${body}`;
}

export function formatQtyCompact(n: number, unit: string): string {
  if (!n) return "";
  const v = formatGoalNumber(n, "quantity");
  switch (unit) {
    case "minutes":
      return `${v}m`;
    case "miles":
      return `${v}mi`;
    case "km":
    case "kilometers":
      return `${v}km`;
    case "sessions":
      return `${v}×`;
    case "reps":
      return `${v}`;
    default: {
      const label = quantityUnitLabel(unit);
      return label ? `${v}${label}` : v;
    }
  }
}

export function formatQtyLong(n: number, unit: string): string {
  if (!n) return "";
  if (unit === "sessions") {
    const v = formatGoalNumber(n, "quantity");
    return Number(v) === 1 ? "1 session" : `${v} sessions`;
  }
  return formatQuantity(n, unit);
}

export type UnitTotal = { unit: string; total: number };

export function rollupUnits(categories: CalendarCategorySummary[]): UnitTotal[] {
  const map = new Map<string, number>();
  for (const c of categories) {
    if (c.metric_kind === "amount" || c.metric_kind === "boolean") continue;
    const q = Number(c.quantity) || 0;
    if (!q) continue;
    const unit = c.unit || "count";
    map.set(unit, (map.get(unit) || 0) + q);
  }
  return [...map.entries()]
    .map(([unit, total]) => ({ unit, total }))
    .sort((a, b) => {
      const ai = UNIT_ORDER.indexOf(a.unit);
      const bi = UNIT_ORDER.indexOf(b.unit);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || b.total - a.total;
    });
}

function categoriesFrom(groups: CalendarGroupSummary[]): CalendarCategorySummary[] {
  return groups.flatMap((g) => g.categories ?? []);
}

function quantityCaption(groups: CalendarGroupSummary[]): string {
  const units = rollupUnits(categoriesFrom(groups));
  if (units.length) {
    return units
      .slice(0, 2)
      .map((u) => formatQtyCompact(u.total, u.unit))
      .join(" ");
  }
  const q = groups.reduce((sum, g) => sum + (Number(g.quantity_total) || 0), 0);
  return q ? formatGoalNumber(q, "quantity") : "";
}

export function dayCellCaption(day: CalendarDay | undefined, filterId: string): string {
  if (!day) return "";
  const groups = groupsForFilter(day, filterId);
  if (filterId === ALL_FILTER || filterId === SPEND_GROUP_KEY) {
    const spend =
      filterId === SPEND_GROUP_KEY
        ? groups.reduce((s, g) => s + (Number(g.expense_total) || 0), 0)
        : Number(day.expense_total) || 0;
    if (spend) return formatSpendDelta(spend);
    if (filterId === SPEND_GROUP_KEY) return "";
    return quantityCaption(groups);
  }
  const spend = groups.reduce((s, g) => s + (Number(g.expense_total) || 0), 0);
  if (spend) return formatSpendDelta(spend);
  return quantityCaption(groups);
}

export type RangeTotals = {
  spend: number;
  units: UnitTotal[];
  categories: CalendarCategorySummary[];
};

export function rangeTotals(
  days: CalendarDay[],
  fromIso: string,
  toIso: string,
  filterId: string
): RangeTotals {
  let spend = 0;
  const catMap = new Map<string, CalendarCategorySummary>();
  for (const day of days) {
    if (day.date < fromIso || day.date > toIso) continue;
    const groups = groupsForFilter(day, filterId);
    if (filterId === ALL_FILTER || filterId === SPEND_GROUP_KEY) {
      spend +=
        filterId === SPEND_GROUP_KEY
          ? groups.reduce((s, g) => s + (Number(g.expense_total) || 0), 0)
          : Number(day.expense_total) || 0;
    } else {
      spend += groups.reduce((s, g) => s + (Number(g.expense_total) || 0), 0);
    }
    for (const cat of categoriesFrom(groups)) {
      const id = `${cat.name}|${cat.unit}|${cat.metric_kind}`;
      const existing = catMap.get(id);
      if (!existing) {
        catMap.set(id, {
          ...cat,
          amount: String(Number(cat.amount) || 0),
          quantity: String(Number(cat.quantity) || 0),
        });
      } else {
        existing.amount = String(
          (Number(existing.amount) || 0) + (Number(cat.amount) || 0)
        );
        existing.quantity = String(
          (Number(existing.quantity) || 0) + (Number(cat.quantity) || 0)
        );
      }
    }
  }
  const categories = [...catMap.values()];
  return { spend, units: rollupUnits(categories), categories };
}

export function formatTotalsLine(totals: RangeTotals, filterId: string): string {
  const showSpend =
    filterId === ALL_FILTER ||
    filterId === SPEND_GROUP_KEY ||
    (totals.spend > 0 && !totals.units.length);
  const parts: string[] = [];
  if (showSpend && totals.spend) parts.push(formatSpendDelta(totals.spend));
  for (const u of totals.units) {
    parts.push(formatQtyLong(u.total, u.unit));
  }
  return parts.join(" · ");
}

export function isSpendishCaption(text: string): boolean {
  return text.startsWith("-") || text.startsWith("+$") || text.startsWith("$");
}
