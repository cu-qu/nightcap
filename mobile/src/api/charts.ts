import { apiRequest } from "@/src/api/client";
import type { ChartResponse } from "@/src/types/api";

export async function fetchCharts(
  period: "daily" | "weekly",
  startDate?: string,
  endDate?: string
): Promise<ChartResponse> {
  const params = new URLSearchParams({ period });
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  return apiRequest<ChartResponse>(`/api/v1/charts/?${params.toString()}`);
}
