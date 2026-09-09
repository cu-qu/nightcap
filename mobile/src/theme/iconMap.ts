import { emojiByKey } from "@/src/theme/emojiOptions";

export const iconMap: Record<string, string> = {
  ...emojiByKey,
};

/** Resolve backend icon key or raw emoji for display. Never show snake_case keys. */
export function iconFor(key?: string | null): string {
  if (!key) return "✨";
  if (iconMap[key]) return iconMap[key];
  // Identifier keys like "spend" must not appear in the UI.
  if (/^[a-z][a-z0-9_]*$/i.test(key)) return "✨";
  return key;
}

/** Prefer saved `emoji`, then map `icon` key, then sparkle. */
export function categoryGlyph(cat: {
  emoji?: string | null;
  icon?: string | null;
}): string {
  const emoji = cat.emoji?.trim();
  if (emoji) return emoji;
  return iconFor(cat.icon);
}

export const SPEND_ICON_KEYS = [
  "fast_food",
  "groceries",
  "car_gas",
  "car_repair",
  "house_supplies",
  "clothes",
  "gifts",
  "online_shopping",
] as const;

export const FOLLOW_UP_ICON_KEYS = [
  "invested",
  "read",
  "run_workout",
  "sauna_meditation",
] as const;
