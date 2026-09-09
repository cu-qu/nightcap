import type { CalendarDay, CalendarGroupSummary } from "@/src/types/api";

export type GroupPeriodSummary = {
  id: string;
  uuid: string | null;
  key: string | null;
  name: string;
  icon: string;
  entry_count: number;
  expense_total: number;
  amount_total: number;
  quantity_total: number;
  category_emojis: string[];
  nights: number;
};

function groupId(g: CalendarGroupSummary): string {
  return g.uuid ?? g.key ?? g.name;
}

/** Roll up per-day `groups[]` into totals for a date range (inclusive). */
export function summarizeGroupsForRange(
  days: CalendarDay[],
  fromIso: string,
  toIso: string
): GroupPeriodSummary[] {
  const map = new Map<string, GroupPeriodSummary>();

  for (const day of days) {
    if (day.date < fromIso || day.date > toIso) continue;
    for (const g of day.groups ?? []) {
      const id = groupId(g);
      const existing = map.get(id);
      if (!existing) {
        map.set(id, {
          id,
          uuid: g.uuid,
          key: g.key,
          name: g.name,
          icon: g.icon,
          entry_count: g.entry_count,
          expense_total: Number(g.expense_total) || 0,
          amount_total: Number(g.amount_total) || 0,
          quantity_total: Number(g.quantity_total) || 0,
          category_emojis: [...(g.category_emojis ?? [])],
          nights: 1,
        });
        continue;
      }
      existing.entry_count += g.entry_count;
      existing.expense_total += Number(g.expense_total) || 0;
      existing.amount_total += Number(g.amount_total) || 0;
      existing.quantity_total += Number(g.quantity_total) || 0;
      existing.nights += 1;
      for (const emoji of g.category_emojis ?? []) {
        if (!existing.category_emojis.includes(emoji)) {
          existing.category_emojis.push(emoji);
        }
      }
    }
  }

  return [...map.values()].sort(
    (a, b) =>
      b.expense_total - a.expense_total ||
      b.entry_count - a.entry_count ||
      a.name.localeCompare(b.name)
  );
}

export function sumExpenseTotal(
  days: CalendarDay[],
  fromIso: string,
  toIso: string
): number {
  return days.reduce((sum, day) => {
    if (day.date < fromIso || day.date > toIso) return sum;
    return sum + (Number(day.expense_total) || 0);
  }, 0);
}
