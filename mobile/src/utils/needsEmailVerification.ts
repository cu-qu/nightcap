import type { User } from "@/src/types/api";

export function needsEmailVerification(user: User | null | undefined): boolean {
  return !!user && user.email_verified === false;
}
