import { apiRequest } from "@/src/api/client";
import type { GoalScope, GoalTemplate, GoalTemplateGroup, Partnership } from "@/src/types/api";

export type OnboardingStatus = {
  onboarding_completed: boolean;
  onboarding_completed_at: string | null;
  tracking_mode: "solo" | "couple";
  active_goal_count: number;
  available_template_count: number;
  inherited_shared_templates: string[];
  partnership: Partnership | null;
};

export type TemplateSelection = {
  slug: string;
  target_value?: string;
  scope?: GoalScope;
  period?: "weekly" | "monthly";
};

export async function fetchOnboardingStatus(): Promise<OnboardingStatus> {
  return apiRequest<OnboardingStatus>("/api/v1/onboarding/status/");
}

export async function fetchOnboardingTemplates(mode?: "solo" | "couple"): Promise<{
  templates: GoalTemplate[];
  by_group: Partial<Record<GoalTemplateGroup, GoalTemplate[]>>;
}> {
  const qs = mode ? `?mode=${mode}` : "";
  return apiRequest(`/api/v1/onboarding/templates/${qs}`);
}

export async function setupOnboarding(input: {
  mode: "solo" | "couple";
  templates: TemplateSelection[];
  invite_email?: string;
}): Promise<{
  created_goal_count: number;
  email_sent: boolean;
  partnership: Partnership | null;
  onboarding: OnboardingStatus;
}> {
  return apiRequest("/api/v1/onboarding/setup/", {
    method: "POST",
    body: {
      mode: input.mode,
      templates: input.templates,
      invite_email: input.invite_email ?? "",
      mark_complete: true,
    },
  });
}
