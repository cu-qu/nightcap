import { apiRequest } from "@/src/api/client";
import type { NightCap } from "@/src/types/api";

export async function getNightCap(date: string): Promise<NightCap> {
  return apiRequest<NightCap>(`/api/v1/nightcaps/${date}/`);
}

export async function listNightCaps(params?: {
  start_date?: string;
  end_date?: string;
}): Promise<NightCap[]> {
  const q = new URLSearchParams();
  if (params?.start_date) q.set("start_date", params.start_date);
  if (params?.end_date) q.set("end_date", params.end_date);
  const qs = q.toString();
  const data = await apiRequest<NightCap[] | { results: NightCap[] }>(
    `/api/v1/nightcaps/${qs ? `?${qs}` : ""}`
  );
  return Array.isArray(data) ? data : data.results ?? [];
}

export async function upsertNightCap(
  body: Partial<Pick<NightCap, "date" | "reflection" | "mood" | "status">> & {
    date: string;
  }
): Promise<NightCap> {
  return apiRequest<NightCap>("/api/v1/nightcaps/", {
    method: "POST",
    body,
  });
}

export async function patchNightCap(
  date: string,
  body: Partial<Pick<NightCap, "reflection" | "mood" | "status">>
): Promise<NightCap> {
  return apiRequest<NightCap>(`/api/v1/nightcaps/${date}/`, {
    method: "PATCH",
    body,
  });
}

/** Persist mood (pass `""` to clear). */
export async function patchMood(date: string, mood: string): Promise<NightCap> {
  return patchNightCap(date, { mood });
}
