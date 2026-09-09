import { Pressable, StyleSheet, Text, View } from "react-native";

import { AmountInput } from "@/src/components/AmountInput";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { colors } from "@/src/theme/colors";
import { categoryGlyph } from "@/src/theme/iconMap";
import type { Category } from "@/src/types/api";
import {
  categoryInputPrefix,
  categoryInputSuffix,
  categoryPhaseLabel,
  categoryUnitLabel,
} from "@/src/utils/ritualCategories";

type Props = {
  category: Category;
  index: number;
  total: number;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  canGoBack: boolean;
  isLastCategory: boolean;
};

export function RitualCategoryStep({
  category,
  index,
  total,
  value,
  onChange,
  onNext,
  onBack,
  onSkip,
  canGoBack,
  isLastCategory,
}: Props) {
  const isBool = category.metric_kind === "boolean";
  const hasValue = isBool
    ? Boolean(value)
    : typeof value === "string" && value.trim().length > 0;

  return (
    <View style={styles.wrap}>
      <Text style={styles.progress}>
        {index + 1} of {total} · {categoryPhaseLabel(category)}
      </Text>

      <View style={styles.dots}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === index && styles.dotActive,
              i < index && styles.dotDone,
            ]}
          />
        ))}
      </View>

      <Text style={styles.emoji}>{categoryGlyph(category)}</Text>
      <Text style={styles.name}>{category.name}</Text>
      <Text style={styles.meta}>{categoryUnitLabel(category)}</Text>

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
        <AmountInput
          value={typeof value === "string" ? value : ""}
          onChangeText={(t) => onChange(t)}
          prefix={categoryInputPrefix(category)}
          suffix={categoryInputSuffix(category)}
          placeholder="0"
        />
      )}

      <View style={styles.actions}>
        <PrimaryButton
          title={isLastCategory ? "Continue" : "Next"}
          onPress={onNext}
        />
        <Pressable onPress={onSkip} style={styles.skip} hitSlop={8}>
          <Text style={styles.skipText}>
            {hasValue ? "Clear & skip" : "Skip"}
          </Text>
        </Pressable>
        {canGoBack ? (
          <Pressable onPress={onBack} style={styles.back} hitSlop={8}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    paddingTop: 8,
  },
  progress: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
    color: colors.accentSoft,
  },
  dots: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.accent,
    width: 18,
  },
  dotDone: {
    backgroundColor: colors.accentSoft,
  },
  emoji: {
    marginTop: 36,
    fontSize: 64,
    textAlign: "center",
  },
  name: {
    marginTop: 16,
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    color: colors.text,
  },
  meta: {
    marginTop: 8,
    marginBottom: 28,
    fontSize: 15,
    textAlign: "center",
    color: colors.muted,
  },
  boolRow: {
    flexDirection: "row",
    gap: 12,
  },
  boolChip: {
    flex: 1,
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  boolChipOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.25)",
  },
  boolLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.muted,
  },
  boolLabelOn: {
    color: colors.accentSoft,
  },
  actions: {
    marginTop: 28,
  },
  skip: {
    marginTop: 16,
    alignItems: "center",
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.accentSoft,
  },
  back: {
    marginTop: 4,
    alignItems: "center",
    paddingVertical: 8,
  },
  backText: {
    fontSize: 15,
    color: colors.muted,
  },
});
