import { apiRequest } from "@/src/api/client";
import type { CalendarResponse } from "@/src/types/api";

export async function fetchCalendar(
  year: number,
  month: number
): Promise<CalendarResponse> {
  return apiRequest<CalendarResponse>(
    `/api/v1/calendar/?year=${year}&month=${month}`
  );
}
