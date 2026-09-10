import { apiRequest } from "@/src/api/client";
import type { ChartResponse } from "@/src/types/api";

export async function fetchCharts(
  period: "daily" | "weekly",
  opts?: { startDate?: string; endDate?: string; group?: string }
): Promise<ChartResponse> {
  const params = new URLSearchParams({ period });
  if (opts?.startDate) params.set("start_date", opts.startDate);
  if (opts?.endDate) params.set("end_date", opts.endDate);
  if (opts?.group) params.set("group", opts.group);
  return apiRequest<ChartResponse>(`/api/v1/charts/?${params.toString()}`);
}
