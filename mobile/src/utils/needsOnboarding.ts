import type { User } from "@/src/types/api";

export function needsOnboarding(user: User | null | undefined): boolean {
  return !!user && user.onboarding_completed !== true;
}
