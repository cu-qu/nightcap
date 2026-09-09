import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors } from "@/src/theme/colors";
import { categoryGlyph } from "@/src/theme/iconMap";
import type { Category } from "@/src/types/api";
import { sanitizeDecimalInput } from "@/src/utils/date";
import {
  categoryInputPrefix,
  categoryInputSuffix,
} from "@/src/utils/ritualCategories";

type Props = {
  category: Category;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
};

export function RitualCategoryField({ category, value, onChange }: Props) {
  const isBool = category.metric_kind === "boolean";
  const prefix = categoryInputPrefix(category);
  const suffix = categoryInputSuffix(category);

  return (
    <View style={styles.row}>
      <Text style={styles.emoji}>{categoryGlyph(category)}</Text>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {category.name}
        </Text>
        {isBool ? (
          <View style={styles.boolRow}>
            <Pressable
              onPress={() => onChange(true)}
              style={[styles.boolChip, value === true && styles.boolChipOn]}
            >
              <Text
                style={[
                  styles.boolLabel,
                  value === true && styles.boolLabelOn,
                ]}
              >
                Yes
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onChange(false)}
              style={[styles.boolChip, value === false && styles.boolChipOn]}
            >
              <Text
                style={[
                  styles.boolLabel,
                  value === false && styles.boolLabelOn,
                ]}
              >
                No
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.inputRow}>
            {prefix ? <Text style={styles.affix}>{prefix}</Text> : null}
            <TextInput
              value={typeof value === "string" ? value : ""}
              onChangeText={(t) => onChange(sanitizeDecimalInput(t))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            {suffix ? <Text style={styles.affixMuted}>{suffix}</Text> : null}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  emoji: {
    marginTop: 2,
    fontSize: 28,
    width: 36,
    textAlign: "center",
  },
  body: {
    flex: 1,
    gap: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  affix: {
    marginRight: 6,
    fontSize: 18,
    fontWeight: "600",
    color: colors.accentSoft,
  },
  affixMuted: {
    marginLeft: 6,
    fontSize: 14,
    color: colors.muted,
  },
  input: {
    flex: 1,
    fontSize: 20,
    fontWeight: "600",
    color: colors.text,
    padding: 0,
  },
  boolRow: {
    flexDirection: "row",
    gap: 8,
  },
  boolChip: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  boolChipOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.25)",
  },
  boolLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.muted,
  },
  boolLabelOn: {
    color: colors.accentSoft,
  },
});
