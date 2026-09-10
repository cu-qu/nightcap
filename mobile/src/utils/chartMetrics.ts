import type {
  ChartCategory,
  ChartPoint,
  ChartQuantityUnit,
} from "@/src/types/api";
import { SPEND_GROUP_KEY } from "@/src/types/api";
import { formatCurrency } from "@/src/utils/date";
import { ALL_FILTER, formatQtyCompact, formatQtyLong } from "@/src/utils/calendarStats";

export type ChartKind = "spend" | "quantity" | "entries";

export type ChartSeries = {
  kind: ChartKind;
  unit: string | null;
  title: string;
  color: string;
};

export function chartCategoryName(cat: ChartCategory): string {
  return cat.name || cat.category__name || "Category";
}

export function rollupUnitsFromPoints(points: ChartPoint[]): ChartQuantityUnit[] {
  const map = new Map<string, number>();
  for (const p of points) {
    for (const row of p.quantity_by_unit ?? []) {
      const n = Number(row.total) || 0;
      if (!n) continue;
      map.set(row.unit, (map.get(row.unit) || 0) + n);
    }
  }
  return [...map.entries()]
    .map(([unit, total]) => ({ unit, total: String(total) }))
    .sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0));
}

export function seriesForFilter(
  filterId: string,
  points: ChartPoint[]
): ChartSeries {
  if (filterId === ALL_FILTER || filterId === SPEND_GROUP_KEY) {
    return {
      kind: "spend",
      unit: null,
      title: "Spend",
      color: filterId === SPEND_GROUP_KEY ? "#F87171" : "#8B5CF6",
    };
  }
  const units = rollupUnitsFromPoints(points);
  if (units.length === 1) {
    const unit = units[0].unit;
    return {
      kind: "quantity",
      unit,
      title: quantitySeriesTitle(unit),
      color: "#2DD4BF",
    };
  }
  if (units.length > 1) {
    const top = units[0];
    const rest = units.slice(1).reduce((s, u) => s + (Number(u.total) || 0), 0);
    if ((Number(top.total) || 0) >= rest) {
      return {
        kind: "quantity",
        unit: top.unit,
        title: quantitySeriesTitle(top.unit),
        color: "#2DD4BF",
      };
    }
  }
  return {
    kind: "entries",
    unit: null,
    title: "Logged entries",
    color: "#A78BFA",
  };
}

function quantitySeriesTitle(unit: string): string {
  switch (unit) {
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
    default:
      return "Count";
  }
}

export function pointValue(
  point: ChartPoint,
  series: ChartSeries
): number {
  if (series.kind === "spend") return Number(point.expense_total) || 0;
  if (series.kind === "quantity" && series.unit) {
    const row = point.quantity_by_unit?.find((u) => u.unit === series.unit);
    return Number(row?.total) || 0;
  }
  return point.entry_count || 0;
}

export function formatChartMoney(n: number): string {
  if (!n) return "";
  if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 0.005) {
    return `$${Math.round(n)}`;
  }
  return `$${n.toFixed(2)}`;
}

export function formatBarValue(value: number, series: ChartSeries): string {
  if (!value) return "";
  if (series.kind === "spend") return formatChartMoney(value);
  if (series.kind === "quantity" && series.unit) {
    return formatQtyCompact(value, series.unit);
  }
  return String(Math.round(value * 10) / 10);
}

export function categoryDisplay(cat: ChartCategory): {
  value: number;
  label: string;
  spendish: boolean;
} {
  const amount = Number(cat.amount_total) || 0;
  const qty = Number(cat.quantity_total) || 0;
  const kind = cat.metric_kind;
  if (kind === "amount" || (amount && (kind !== "quantity" && kind !== "boolean"))) {
    return {
      value: amount,
      label: amount ? formatCurrency(amount) : "",
      spendish: true,
    };
  }
  if (kind === "boolean") {
    return {
      value: qty,
      label: qty ? (qty === 1 ? "1 time" : `${formatQtyCompact(qty, "count")} times`) : "",
      spendish: false,
    };
  }
  return {
    value: qty,
    label: qty ? formatQtyLong(qty, cat.unit || "count") : "",
    spendish: false,
  };
}

export function axisLabel(iso: string | null | undefined, period: "daily" | "weekly"): string {
  if (!iso) return "";
  if (period === "daily") return iso.slice(8);
  const [, month, day] = iso.split("-");
  if (!month || !day) return iso.slice(5);
  return `${Number(month)}/${Number(day)}`;
}
