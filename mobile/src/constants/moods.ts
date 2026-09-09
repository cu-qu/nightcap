/** Suggested NightCap mood chips. Value IS the emoji string (max 32). */
export const SUGGESTED_MOODS = [
  { emoji: "🤩", label: "Great" },
  { emoji: "🙂", label: "Good" },
  { emoji: "😐", label: "Okay" },
  { emoji: "😔", label: "Low" },
  { emoji: "😣", label: "Rough" },
] as const;

export type SuggestedMood = (typeof SUGGESTED_MOODS)[number];

export const MOOD_MAX_LENGTH = 32;

export function clampMood(value: string): string {
  return value.trim().slice(0, MOOD_MAX_LENGTH);
}

export function moodLabel(mood: string): string | undefined {
  return SUGGESTED_MOODS.find((m) => m.emoji === mood)?.label;
}
