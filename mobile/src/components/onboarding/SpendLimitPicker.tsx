import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors } from "@/src/theme/colors";
import type { GoalScope, GoalTemplate } from "@/src/types/api";
import { sanitizeDecimalInput } from "@/src/utils/date";
import { templateGlyph } from "@/src/utils/templateGlyph";

export type SpendPeriod = "weekly" | "monthly";

const MONTHLY_PRESETS = ["50", "100", "150", "200", "300", "400"];
const WEEKLY_PRESETS = ["25", "50", "75", "100", "150"];
const PINNED = [
  "groceries-monthly-max",
  "gas-monthly-max",
  "going-out-monthly-max",
  "misc-monthly-max",
];

export function formatTemplateTarget(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return Number.isInteger(n) ? String(n) : String(n);
}

export function convertSpendTarget(
  value: string,
  from: SpendPeriod,
  to: SpendPeriod
): string {
  if (from === to) return value;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return value;
  const next = from === "monthly" && to === "weekly" ? n / 4 : n * 4;
  const rounded = Math.round(next * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function monthlyFromWeekly(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const monthly = Math.round(n * 4 * 100) / 100;
  return Number.isInteger(monthly) ? String(monthly) : monthly.toFixed(2);
}

type Props = {
  templates: GoalTemplate[];
  selected: Record<string, GoalScope>;
  targets: Record<string, string>;
  periods: Record<string, SpendPeriod | string>;
  locked: Set<string>;
  couple: boolean;
  onToggle: (template: GoalTemplate) => void;
  onScope: (slug: string, scope: GoalScope) => void;
  onTarget: (slug: string, value: string) => void;
  onPeriod: (slug: string, period: SpendPeriod) => void;
};

export function SpendLimitPicker({
  templates,
  selected,
  targets,
  periods,
  locked,
  couple,
  onToggle,
  onScope,
  onTarget,
  onPeriod,
}: Props) {
  const ordered = [...templates].sort((a, b) => {
    const ai = PINNED.indexOf(a.slug);
    const bi = PINNED.indexOf(b.slug);
    if (ai === -1 && bi === -1) return a.sort_order - b.sort_order;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  const selectedList = ordered.filter((t) => t.slug in selected);
  const anyWeekly = selectedList.some(
    (template) => (periods[template.slug] ?? "monthly") === "weekly"
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>Categories</Text>
      <Text style={styles.hint}>Tap as many as you want.</Text>
      <View style={styles.chips}>
        {ordered.map((template) => {
          const isOn = template.slug in selected;
          const isLocked = locked.has(template.slug);
          return (
            <Pressable
              key={template.slug}
              onPress={() => {
                if (!isLocked) onToggle(template);
              }}
              style={[styles.chip, isOn && styles.chipOn]}
            >
              <Text style={styles.chipEmoji}>
                {templateGlyph(template)}
              </Text>
              <Text style={[styles.chipLabel, isOn && styles.chipLabelOn]}>
                {template.category_name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {selectedList.length > 0 ? (
        <>
          <Text style={styles.section}>Limits</Text>
          <Text style={styles.hint}>
            Stay under these amounts. Switch a cap to weekly or monthly.
          </Text>
          {selectedList.map((template) => {
            const scope = selected[template.slug] ?? template.suggested_scope;
            const isLocked = locked.has(template.slug);
            const period = periods[template.slug] ?? "monthly";
            const value =
              targets[template.slug] ?? formatTemplateTarget(template.target_value);
            const presets = period === "weekly" ? WEEKLY_PRESETS : MONTHLY_PRESETS;
            const monthlyEq = period === "weekly" ? monthlyFromWeekly(value) : "";
            return (
              <View key={template.slug} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardEmoji}>
                    {templateGlyph(template)}
                  </Text>
                  <View style={styles.cardTitles}>
                    <Text style={styles.cardName}>{template.category_name}</Text>
                    <Text style={styles.cardPeriod}>
                      {period === "weekly" ? "per week" : "per month"}
                    </Text>
                  </View>
                  {couple ? (
                    <View style={styles.scopeRow}>
                      {(["shared", "personal"] as const).map((item) => {
                        const on = scope === item;
                        const disable = isLocked && item === "personal";
                        return (
                          <Pressable
                            key={item}
                            disabled={disable}
                            onPress={() => onScope(template.slug, item)}
                            style={[styles.scopeBtn, on && styles.scopeBtnOn]}
                          >
                            <Text
                              style={[styles.scopeText, on && styles.scopeTextOn]}
                            >
                              {item === "shared" ? "Together" : "Just me"}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>

                <View style={styles.segment}>
                  {(["weekly", "monthly"] as const).map((item) => {
                    const on = period === item;
                    return (
                      <Pressable
                        key={item}
                        onPress={() => onPeriod(template.slug, item)}
                        style={[styles.segBtn, on && styles.segBtnOn]}
                      >
                        <Text style={[styles.segText, on && styles.segTextOn]}>
                          {item === "weekly" ? "Weekly" : "Monthly"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.amountRow}>
                  <Text style={styles.dollar}>$</Text>
                  <TextInput
                    value={value}
                    onChangeText={(t) =>
                      onTarget(template.slug, sanitizeDecimalInput(t))
                    }
                    keyboardType="decimal-pad"
                    placeholder={formatTemplateTarget(template.target_value)}
                    placeholderTextColor={colors.muted}
                    style={styles.amount}
                  />
                </View>

                <View style={styles.presets}>
                  {presets.map((preset) => {
                    const on = value === preset;
                    return (
                      <Pressable
                        key={preset}
                        onPress={() => onTarget(template.slug, preset)}
                        style={[styles.preset, on && styles.presetOn]}
                      >
                        <Text
                          style={[styles.presetText, on && styles.presetTextOn]}
                        >
                          ${preset}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {period === "weekly" ? (
                  <Text style={styles.asterisk}>
                    * This will be 4× for monthly tracking
                    {monthlyEq ? ` ($${monthlyEq}/month)` : ""}.
                  </Text>
                ) : null}
              </View>
            );
          })}
          {anyWeekly ? (
            <Text style={styles.asteriskFoot}>
              * Weekly caps are counted as 4× in the monthly view.
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.empty}>
          Pick Groceries, Gas, Going Out, Misc — or any mix.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  section: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.accentSoft,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    marginBottom: 6,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.22)",
  },
  chipEmoji: {
    fontSize: 20,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.muted,
  },
  chipLabelOn: {
    color: colors.text,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardEmoji: {
    fontSize: 24,
  },
  cardTitles: {
    flex: 1,
  },
  cardName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  cardPeriod: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },
  scopeRow: {
    flexDirection: "row",
    gap: 6,
  },
  scopeBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  scopeBtnOn: {
    borderColor: colors.accentSoft,
    backgroundColor: "rgba(167, 139, 250, 0.2)",
  },
  scopeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
  },
  scopeTextOn: {
    color: colors.accentSoft,
  },
  segment: {
    flexDirection: "row",
    gap: 8,
  },
  segBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  segBtnOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.25)",
  },
  segText: {
    fontWeight: "700",
    color: colors.muted,
  },
  segTextOn: {
    color: colors.accentSoft,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dollar: {
    marginRight: 8,
    fontSize: 28,
    fontWeight: "700",
    color: colors.accentSoft,
  },
  amount: {
    flex: 1,
    fontSize: 32,
    fontWeight: "700",
    color: colors.text,
    padding: 0,
  },
  presets: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  preset: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  presetOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.22)",
  },
  presetText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
  },
  presetTextOn: {
    color: colors.accentSoft,
  },
  asterisk: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.accentSoft,
  },
  asteriskFoot: {
    marginTop: 2,
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  empty: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
});
