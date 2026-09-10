import { apiRequest } from "@/src/api/client";
import type {
  RitualRequest,
  RitualResponse,
  SharedRitualResponse,
} from "@/src/types/api";

export async function saveRitual(payload: RitualRequest): Promise<RitualResponse> {
  return apiRequest<RitualResponse>("/api/v1/ritual/", {
    method: "POST",
    body: payload,
  });
}

export async function getSharedRitual(
  date: string
): Promise<SharedRitualResponse> {
  return apiRequest<SharedRitualResponse>(
    `/api/v1/ritual/shared/?date=${encodeURIComponent(date)}`
  );
}

export async function patchDayReflection(
  date: string,
  reflection: string
): Promise<{ date: string; reflection: string }> {
  return apiRequest(`/api/v1/day-reflections/${date}/`, {
    method: "PATCH",
    body: { reflection },
  });
}
