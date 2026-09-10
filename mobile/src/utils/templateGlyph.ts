import { categoryGlyph } from "@/src/theme/iconMap";

export function templateGlyph(template: {
  category_emoji?: string | null;
  category_icon?: string | null;
  category_name?: string | null;
}): string {
  const glyph = categoryGlyph({
    emoji: template.category_emoji,
    icon: template.category_icon,
    name: template.category_name,
  });
  return glyph === "✨" ? "📌" : glyph;
}
