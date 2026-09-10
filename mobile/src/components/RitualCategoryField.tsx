import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors } from "@/src/theme/colors";
import { categoryGlyph } from "@/src/theme/iconMap";
import type {
  Category,
  CompletedWith,
  SharedRitualHint,
} from "@/src/types/api";
import { sanitizeDecimalInput } from "@/src/utils/date";
import {
  categoryInputPrefix,
  categoryInputSuffix,
  categorySupportsCompletedWith,
  formatPartnerRitualValue,
} from "@/src/utils/ritualCategories";

type Props = {
  category: Category;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
  together?: boolean;
  partnerHint?: SharedRitualHint | null;
  showCompletedWith?: boolean;
  completedWith?: CompletedWith;
  onCompletedWithChange?: (value: CompletedWith) => void;
};

function hasLoggedValue(category: Category, value: string | boolean): boolean {
  if (category.metric_kind === "boolean") return value === true;
  if (typeof value !== "string") return false;
  const n = Number(value.trim());
  return value.trim().length > 0 && Number.isFinite(n) && n > 0;
}

export function RitualCategoryField({
  category,
  value,
  onChange,
  together = false,
  partnerHint = null,
  showCompletedWith = false,
  completedWith = "alone",
  onCompletedWithChange,
}: Props) {
  const isBool = category.metric_kind === "boolean";
  const prefix = categoryInputPrefix(category);
  const suffix = categoryInputSuffix(category);
  const partnerLine = partnerHint
    ? formatPartnerRitualValue(partnerHint)
    : null;
  const showCompleted =
    showCompletedWith &&
    categorySupportsCompletedWith(category) &&
    hasLoggedValue(category, value);

  return (
    <View style={styles.row}>
      <Text style={styles.emoji}>{categoryGlyph(category)}</Text>
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {category.name}
          </Text>
          {together ? (
            <View style={styles.togetherPill}>
              <Text style={styles.togetherLabel}>Together</Text>
            </View>
          ) : null}
        </View>
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
        {showCompleted ? (
          <View style={styles.completedBlock}>
            <Text style={styles.completedLabel}>Completed</Text>
            <View style={styles.boolRow}>
              <Pressable
                onPress={() => onCompletedWithChange?.("with_partner")}
                style={[
                  styles.boolChip,
                  completedWith === "with_partner" && styles.boolChipOn,
                ]}
              >
                <Text
                  style={[
                    styles.boolLabel,
                    completedWith === "with_partner" && styles.boolLabelOn,
                  ]}
                >
                  With Partner
                </Text>
              </Pressable>
              <Pressable
                onPress={() => onCompletedWithChange?.("alone")}
                style={[
                  styles.boolChip,
                  completedWith === "alone" && styles.boolChipOn,
                ]}
              >
                <Text
                  style={[
                    styles.boolLabel,
                    completedWith === "alone" && styles.boolLabelOn,
                  ]}
                >
                  Alone
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {showCompleted && together ? (
          <Text style={styles.partnerHint}>
            If you both pick With Partner, this counts once.
          </Text>
        ) : null}
        {partnerLine ? (
          <Text style={styles.partnerHint}>{partnerLine}</Text>
        ) : null}
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
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: {
    flex: 1,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  togetherPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(139, 92, 246, 0.22)",
  },
  togetherLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accentSoft,
  },
  partnerHint: {
    fontSize: 13,
    color: colors.muted,
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
  completedBlock: {
    gap: 6,
  },
  completedLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.muted,
  },
});
