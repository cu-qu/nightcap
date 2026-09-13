import type {
  ChartCategory,
  ChartPoint,
  ChartQuantityUnit,
} from "@/src/types/api";
import { SPEND_GROUP_KEY } from "@/src/types/api";
import { formatCurrency } from "@/src/utils/date";
import { ALL_FILTER, formatQtyCompact, formatQtyLong } from "@/src/utils/calendarStats";

export const TOGETHER_FILTER = "together";
export const ALONE_FILTER = "alone";
export const TOGETHER_COLOR = "#F472B6";
export const ALONE_COLOR = "#818CF8";

export type ChartKind = "spend" | "quantity" | "entries" | "together" | "alone";

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

function seriesFromActivity(
  points: ChartPoint[],
  title: string,
  color: string
): ChartSeries {
  const spend = points.reduce(
    (sum, point) => sum + (Number(point.expense_total) || 0),
    0
  );
  if (spend > 0) {
    return { kind: "spend", unit: null, title, color };
  }
  const units = rollupUnitsFromPoints(points);
  if (units.length === 1) {
    return {
      kind: "quantity",
      unit: units[0].unit,
      title,
      color,
    };
  }
  if (units.length > 1) {
    const top = units[0];
    const rest = units.slice(1).reduce((s, u) => s + (Number(u.total) || 0), 0);
    if ((Number(top.total) || 0) >= rest) {
      return {
        kind: "quantity",
        unit: top.unit,
        title,
        color,
      };
    }
  }
  const hasEntries = points.some((p) => (p.entry_count || 0) > 0);
  return {
    kind: hasEntries ? "entries" : "spend",
    unit: null,
    title,
    color,
  };
}

export function seriesForFilter(
  filterId: string,
  points: ChartPoint[]
): ChartSeries {
  if (filterId === TOGETHER_FILTER) {
    return seriesFromActivity(points, "Together", TOGETHER_COLOR);
  }
  if (filterId === ALONE_FILTER) {
    return seriesFromActivity(points, "Solo", ALONE_COLOR);
  }
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
  if (series.kind === "together") return point.together_count || 0;
  if (series.kind === "alone") return point.alone_count || 0;
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
  return metricDisplay(
    Number(cat.amount_total) || 0,
    Number(cat.quantity_total) || 0,
    cat.metric_kind,
    cat.unit,
    false
  );
}

export function categoryYoursDisplay(cat: ChartCategory): {
  value: number;
  label: string;
  spendish: boolean;
} {
  return metricDisplay(
    Number(cat.yours_amount) || 0,
    Number(cat.yours_quantity) || 0,
    cat.metric_kind,
    cat.unit,
    true
  );
}

function metricDisplay(
  amount: number,
  qty: number,
  kind: ChartCategory["metric_kind"],
  unit: string | null | undefined,
  allowZero: boolean
): { value: number; label: string; spendish: boolean } {
  if (kind === "amount" || (amount && kind !== "quantity" && kind !== "boolean")) {
    return {
      value: amount,
      label: amount || allowZero ? formatCurrency(amount) : "",
      spendish: true,
    };
  }
  if (kind === "boolean") {
    if (!qty && !allowZero) {
      return { value: 0, label: "", spendish: false };
    }
    return {
      value: qty,
      label: qty === 1 ? "1 time" : `${qty || 0} times`,
      spendish: false,
    };
  }
  if (!qty && !allowZero) {
    return { value: 0, label: "", spendish: false };
  }
  return {
    value: qty,
    label: qty ? formatQtyLong(qty, unit || "count") : "0",
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

const CATEGORY_COLORS = [
  "#F87171",
  "#FBBF24",
  "#34D399",
  "#60A5FA",
  "#A78BFA",
  "#F472B6",
  "#FB923C",
  "#2DD4BF",
  "#C084FC",
  "#38BDF8",
  "#4ADE80",
  "#E879F9",
  "#818CF8",
  "#F59E0B",
  "#F43F5E",
  "#22D3EE",
];

function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function extraColor(index: number): string {
  const hue = (index * 137.508) % 360;
  const sat = 68 + (index % 3) * 6;
  const light = 58 + (index % 2) * 6;
  return `hsl(${Math.round(hue)}, ${sat}%, ${light}%)`;
}

/** One unique color per id. Prefers a hashed palette slot, then the next free hue. */
export function uniqueCategoryColors(ids: string[]): Map<string, string> {
  const unique = [...new Set(ids.filter(Boolean))].sort();
  const used = new Set<number>();
  const map = new Map<string, string>();
  unique.forEach((id, i) => {
    let idx = hashKey(id) % CATEGORY_COLORS.length;
    let step = 0;
    while (used.has(idx) && step < CATEGORY_COLORS.length) {
      idx = (idx + 1) % CATEGORY_COLORS.length;
      step += 1;
    }
    if (step >= CATEGORY_COLORS.length) {
      map.set(id, extraColor(i + CATEGORY_COLORS.length));
      return;
    }
    used.add(idx);
    map.set(id, CATEGORY_COLORS[idx]);
  });
  return map;
}

export function colorForCategory(
  id: string,
  colors?: Map<string, string>
): string {
  if (colors?.has(id)) return colors.get(id) as string;
  if (!id) return CATEGORY_COLORS[0];
  return CATEGORY_COLORS[hashKey(id) % CATEGORY_COLORS.length];
}

export function categoryColorId(cat: {
  uuid?: string | null;
  category__uuid?: string;
  name?: string | null;
}): string {
  return cat.uuid || cat.category__uuid || cat.name || "";
}

export function segmentValue(
  seg: {
    amount?: string;
    quantity?: string;
    entry_count?: number;
    together_count?: number;
    alone_count?: number;
    type?: string;
    metric_kind?: string;
    unit?: string;
  },
  series: ChartSeries
): number {
  if (series.kind === "together") return seg.together_count || 0;
  if (series.kind === "alone") return seg.alone_count || 0;
  if (series.kind === "spend") {
    if (seg.metric_kind === "quantity" || seg.metric_kind === "boolean") return 0;
    if (seg.type && seg.type !== "finance_expense") return 0;
    return Number(seg.amount) || 0;
  }
  if (series.kind === "quantity" && series.unit) {
    if ((seg.unit || "count") !== series.unit) return 0;
    return Number(seg.quantity) || 0;
  }
  return seg.entry_count || 0;
}
