import type { User } from "@/src/types/api";

export function needsPaywall(user: User | null | undefined): boolean {
  if (!user || user.onboarding_completed !== true) return false;
  if (!user.membership) return false;
  return user.membership.is_active === false;
}

export function trialDaysLeft(trialEndsAt: string | null | undefined): number | null {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000));
}

export function membershipSummary(user: User | null | undefined): string {
  const membership = user?.membership;
  if (!membership) return "Included while you get started.";
  if (membership.status === "complimentary") {
    return membership.covers_couple
      ? "Complimentary NightCap for both of you."
      : "Complimentary NightCap membership.";
  }
  if (membership.status === "trial") {
    const days = trialDaysLeft(membership.trial_ends_at);
    if (days == null) return "30 days of NightCap are included.";
    if (days <= 0) return "Your 30 days have ended.";
    if (days === 1) return "1 day left of your 30 days.";
    return `${days} days left of your 30 days.`;
  }
  if (membership.status === "active") {
    const plan = membership.plan === "yearly" ? "Yearly" : "Monthly";
    return membership.covers_couple
      ? `${plan} · covers both of you`
      : `${plan} membership`;
  }
  return "Subscribe to keep NightCap for two.";
}
