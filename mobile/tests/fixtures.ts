import type { User } from "@/src/types/api";

const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "16158342-1017-4df4-93b7-d5ca666e3ca5",
    username: "ux1022f",
    email: "ux1022f@example.com",
    onboarding_completed: true,
    tracking_mode: "solo",
    partnership: null,
    membership: {
      status: "trial",
      is_active: true,
      plan: null,
      source: "trial",
      trial_ends_at: trialEnd,
      expires_at: trialEnd,
      auto_renewing: false,
      covers_couple: false,
      product_id: null,
    },
    ...overrides,
  };
}
