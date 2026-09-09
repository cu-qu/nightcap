import { iconFor } from "@/src/theme/iconMap";

/** Distinct glyphs when the API omits `category_emoji` or sends a generic sparkle. */
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
  Walks: "🚶",
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

const GLYPH_BY_ICON: Record<string, string> = {
  groceries: "🛒",
  car_gas: "⛽",
  fuelpump: "⛽",
  going_out: "🎉",
  gifts: "🎁",
  eating_out: "🍽️",
  food_deliveries: "🛵",
  wineglass: "🍷",
  house_supplies: "🏠",
  online_shopping: "🛍️",
  clothes: "👕",
  "figure.run": "🏃",
  run_workout: "🏃",
  coffee: "☕",
  walks: "🚶",
  misc: "🧾",
  drop: "💧",
  read: "📖",
  sauna_meditation: "🧘",
  "figure.strengthtraining.traditional": "💪",
  "figure.core.training": "🤸",
};

export function templateGlyph(template: {
  category_emoji?: string | null;
  category_icon?: string | null;
  category_name?: string | null;
}): string {
  const emoji = template.category_emoji?.trim();
  if (emoji && emoji !== "✨") return emoji;
  const icon = template.category_icon?.trim() ?? "";
  if (GLYPH_BY_ICON[icon]) return GLYPH_BY_ICON[icon];
  const fromIcon = iconFor(icon);
  if (fromIcon && fromIcon !== "✨") return fromIcon;
  const name = template.category_name?.trim() ?? "";
  if (GLYPH_BY_NAME[name]) return GLYPH_BY_NAME[name];
  return "📌";
}
