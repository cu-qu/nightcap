import { apiRequest } from "@/src/api/client";
import type {
  RecapIndexResponse,
  RecapMonthResponse,
  RecapYearResponse,
} from "@/src/types/api";

export async function fetchRecapIndex(): Promise<RecapIndexResponse> {
  return apiRequest<RecapIndexResponse>("/api/v1/recaps/");
}

export async function fetchMonthRecap(
  year: number,
  month: number
): Promise<RecapMonthResponse> {
  return apiRequest<RecapMonthResponse>(
    `/api/v1/recaps/month/?year=${year}&month=${month}`
  );
}

export async function fetchYearRecap(year: number): Promise<RecapYearResponse> {
  return apiRequest<RecapYearResponse>(`/api/v1/recaps/year/?year=${year}`);
}
