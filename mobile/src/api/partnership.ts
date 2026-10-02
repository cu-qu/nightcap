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

export type PartnerNudge = {
  date: string;
  from_username: string;
  to_username: string;
  created_at: string;
  already_sent: boolean;
  delivered_via: string[];
};

export async function nudgePartner(date: string): Promise<{ nudge: PartnerNudge }> {
  return apiRequest("/api/v1/partnership/nudge/", {
    method: "POST",
    body: { date },
  });
}

export async function registerDevicePushToken(input: {
  token: string;
  platform?: string;
}): Promise<{ detail: string }> {
  return apiRequest("/api/v1/devices/push-token/", {
    method: "POST",
    body: input,
  });
}

export async function removeDevicePushToken(token: string): Promise<{ detail: string }> {
  return apiRequest("/api/v1/devices/push-token/", {
    method: "DELETE",
    body: { token },
  });
}

export function nudgeSentMessage(nudge: PartnerNudge): string {
  if (nudge.already_sent) return `Already nudged ${nudge.to_username}`;
  if (nudge.delivered_via.includes("push")) {
    return `Notification sent to ${nudge.to_username}`;
  }
  return `Nudged ${nudge.to_username}`;
}
