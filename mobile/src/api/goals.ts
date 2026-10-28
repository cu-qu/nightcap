import { apiRequest } from "@/src/api/client";
import type {
  GoalPeriod,
  GroupGoalSummary,
  PendingTogetherGoal,
  SetGoalInput,
} from "@/src/types/goals";

export async function getGroupSummary(
  period?: GoalPeriod
): Promise<GroupGoalSummary> {
  const qs = period ? `?period=${period}` : "";
  return apiRequest<GroupGoalSummary>(`/api/v1/goals/group-summary/${qs}`);
}

export async function getPendingGoals(): Promise<PendingTogetherGoal[]> {
  return apiRequest<PendingTogetherGoal[]>("/api/v1/goals/pending/");
}

export async function setGoal(input: SetGoalInput): Promise<unknown> {
  return apiRequest("/api/v1/goals/set/", {
    method: "POST",
    body: input,
  });
}

export async function acceptGoal(id: number): Promise<unknown> {
  return apiRequest(`/api/v1/goals/${id}/accept/`, { method: "POST" });
}

export async function declineGoal(id: number): Promise<void> {
  await apiRequest(`/api/v1/goals/${id}/decline/`, { method: "POST" });
}

export async function deactivateGoal(id: number): Promise<void> {
  await apiRequest(`/api/v1/goals/${id}/`, {
    method: "DELETE",
  });
}
