import { apiRequest } from "@/src/api/client";
import type { Partnership } from "@/src/types/api";

export async function fetchPartnership(): Promise<{ partnership: Partnership | null }> {
  return apiRequest("/api/v1/partnership/");
}

export async function ensurePartnership(): Promise<{ partnership: Partnership }> {
  return apiRequest("/api/v1/partnership/", { method: "POST" });
}

export async function invitePartner(email: string): Promise<{
  partnership: Partnership;
  email_sent: boolean;
}> {
  return apiRequest("/api/v1/partnership/invite/", {
    method: "POST",
    body: { email },
  });
}

export async function joinPartnership(invite_code: string): Promise<{
  partnership: Partnership;
}> {
  return apiRequest("/api/v1/partnership/join/", {
    method: "POST",
    body: { invite_code },
  });
}
