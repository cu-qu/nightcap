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

/** Known category names when emoji/icon is missing or the generic sparkle. */
const GLYPH_BY_NAME: Record<string, string> = {
  Groceries: "🛒",
  Gas: "⛽",
  "Going Out": "🎉",
  Misc: "🧾",
  "Eating Out": "🍽️",
  "Food Deliveries": "🛵",
  "Date Night": "🌹",
  Drinks: "🍻",
  Coffee: "☕",
  "House Supplies": "🏠",
  "Online Shopping": "🛍️",
  Clothes: "👕",
  Workout: "🏋️",
  "Workout time": "🏋️",
  Walks: "🚶",
  "Walk time": "🚶",
  "Walk distance": "🚶",
  Running: "🏃",
  "Running time": "🏃",
  "Running distance": "🏃",
  Biking: "🚴",
  "Biking time": "🚴",
  "Biking distance": "🚴",
  "I Ran / Worked Out": "🏃",
  "Push Ups": "💪",
  "Sit Ups": "🤸",
  Water: "💧",
  "I Read": "📖",
  "Sauna / Meditation": "🧘",
  "Quality Time": "🛋️",
  "Cook at Home": "🍳",
  "Phone-free Evening": "📵",
};

/** Prefer saved `emoji`, then category name, then `icon` key. Sparkle is a missing glyph. */
export function categoryGlyph(cat: {
  emoji?: string | null;
  icon?: string | null;
  name?: string | null;
}): string {
  const emoji = cat.emoji?.trim();
  if (emoji && emoji !== "✨") return emoji;
  const name = cat.name?.trim() ?? "";
  if (GLYPH_BY_NAME[name]) return GLYPH_BY_NAME[name];
  const fromIcon = iconFor(cat.icon);
  if (fromIcon && fromIcon !== "✨") return fromIcon;
  return "✨";
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
  "drop",
  "run_workout",
  "running",
  "biking",
  "walks",
  "figure.strengthtraining.traditional",
  "figure.core.training",
  "invested",
  "read",
  "sauna_meditation",
] as const;
