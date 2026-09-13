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

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function formatInviteCodeInput(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function joinPartnership(invite_code: string): Promise<{
  partnership: Partnership;
}> {
  return apiRequest("/api/v1/partnership/join/", {
    method: "POST",
    body: { invite_code: normalizeInviteCode(invite_code) },
  });
}

export async function leavePartnership(): Promise<{ partnership: null }> {
  return apiRequest("/api/v1/partnership/leave/", { method: "POST" });
}
