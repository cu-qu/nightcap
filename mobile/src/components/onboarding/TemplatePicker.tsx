import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/src/theme/colors";
import type { GoalScope, GoalTemplate } from "@/src/types/api";
import { templateGlyph } from "@/src/utils/templateGlyph";

type Props = {
  templates: GoalTemplate[];
  selected: Record<string, GoalScope>;
  locked: Set<string>;
  couple: boolean;
  onToggle: (template: GoalTemplate) => void;
  onScope: (slug: string, scope: GoalScope) => void;
};

export function TemplatePicker({
  templates,
  selected,
  locked,
  couple,
  onToggle,
  onScope,
}: Props) {
  return (
    <View style={styles.wrap}>
      {templates.map((template) => {
        const isOn = template.slug in selected;
        const isLocked = locked.has(template.slug);
        const scope = selected[template.slug] ?? template.suggested_scope;
        const emoji = templateGlyph(template);
        return (
          <View key={template.slug} style={styles.block}>
            <Pressable
              onPress={() => {
                if (!isLocked) onToggle(template);
              }}
              style={[styles.chip, isOn && styles.chipOn]}
            >
              <Text style={styles.emoji}>{emoji}</Text>
              <View style={styles.chipText}>
                <Text style={[styles.title, isOn && styles.titleOn]}>
                  {template.category_name}
                </Text>
                <Text style={styles.hint} numberOfLines={2}>
                  {template.title}
                  {template.example_entry_label
                    ? ` · ${template.example_entry_label}`
                    : ""}
                </Text>
              </View>
              <View style={[styles.mark, isOn && styles.markOn]}>
                <Text style={[styles.markText, isOn && styles.markTextOn]}>
                  {isOn ? "✓" : "+"}
                </Text>
              </View>
            </Pressable>
            {couple && isOn ? (
              <View style={styles.scopeRow}>
                {(["shared", "personal"] as const).map((value) => {
                  const on = scope === value;
                  const disable = isLocked && value === "personal";
                  return (
                    <Pressable
                      key={value}
                      disabled={disable}
                      onPress={() => onScope(template.slug, value)}
                      style={[styles.scopeBtn, on && styles.scopeBtnOn]}
                    >
                      <Text style={[styles.scopeText, on && styles.scopeTextOn]}>
                        {value === "shared" ? "Together" : "Just me"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  block: {
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  chipOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.18)",
  },
  emoji: {
    fontSize: 26,
  },
  chipText: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  titleOn: {
    color: colors.text,
  },
  hint: {
    marginTop: 2,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  mark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.elevated,
  },
  markOn: {
    backgroundColor: colors.accent,
  },
  markText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.muted,
  },
  markTextOn: {
    color: "#fff",
  },
  scopeRow: {
    flexDirection: "row",
    gap: 8,
    marginLeft: 42,
  },
  scopeBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  scopeBtnOn: {
    borderColor: colors.accentSoft,
    backgroundColor: "rgba(167, 139, 250, 0.2)",
  },
  scopeText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
  },
  scopeTextOn: {
    color: colors.accentSoft,
  },
});
