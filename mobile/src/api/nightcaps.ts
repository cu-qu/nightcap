import { apiRequest, getApiBaseUrl } from "@/src/api/client";
import type { NightCap } from "@/src/types/api";

export async function getNightCap(date: string): Promise<NightCap> {
  return apiRequest<NightCap>(`/api/v1/nightcaps/${date}/`);
}

export function nightCapPhotoPath(date: string): string {
  return `/api/v1/nightcaps/${date}/photo/`;
}

export function nightCapPhotoUrl(date: string, cacheKey?: string): string {
  const path = nightCapPhotoPath(date);
  const url = `${getApiBaseUrl()}${path}`;
  if (!cacheKey) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}t=${encodeURIComponent(cacheKey)}`;
}

export async function uploadNightCapPhoto(
  date: string,
  file: { uri: string; name: string; type: string }
): Promise<NightCap> {
  const form = new FormData();
  form.append("photo", {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);
  return apiRequest<NightCap>(nightCapPhotoPath(date), {
    method: "POST",
    body: form,
  });
}

export async function deleteNightCapPhoto(date: string): Promise<NightCap> {
  return apiRequest<NightCap>(nightCapPhotoPath(date), {
    method: "DELETE",
  });
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
  body: Partial<
    Pick<NightCap, "date" | "reflection" | "favorite_moment" | "mood" | "status">
  > & {
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
  body: Partial<Pick<NightCap, "reflection" | "favorite_moment" | "mood" | "status">>
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
