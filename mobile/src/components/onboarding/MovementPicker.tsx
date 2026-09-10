import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors } from "@/src/theme/colors";
import type { GoalScope, GoalTemplate } from "@/src/types/api";
import { sanitizeDecimalInput } from "@/src/utils/date";
import { templateGlyph } from "@/src/utils/templateGlyph";
import { quantityUnitLabel } from "@/src/utils/units";
import { formatTemplateTarget } from "@/src/components/onboarding/SpendLimitPicker";

export type MovementPeriod = "daily" | "weekly";
export type MovementMetric = "sessions" | "minutes" | "miles" | "reps";

type FamilyConfig = {
  id: string;
  label: string;
  defaultMetric: MovementMetric;
  metrics: Partial<Record<MovementMetric, string>>;
};

const FAMILIES: FamilyConfig[] = [
  {
    id: "running",
    label: "Running",
    defaultMetric: "minutes",
    metrics: {
      sessions: "running-sessions-weekly",
      minutes: "running-minutes-weekly",
      miles: "running-miles-weekly",
    },
  },
  {
    id: "biking",
    label: "Biking",
    defaultMetric: "minutes",
    metrics: {
      sessions: "biking-sessions-weekly",
      minutes: "biking-minutes-weekly",
      miles: "biking-miles-weekly",
    },
  },
  {
    id: "workout",
    label: "Workout",
    defaultMetric: "sessions",
    metrics: {
      sessions: "workouts-weekly-min",
      minutes: "workouts-minutes-weekly",
    },
  },
  {
    id: "walks",
    label: "Walks",
    defaultMetric: "sessions",
    metrics: {
      sessions: "walks-weekly-min",
      minutes: "walks-minutes-weekly",
      miles: "walks-miles-weekly",
    },
  },
  {
    id: "pushups",
    label: "Push-ups",
    defaultMetric: "reps",
    metrics: { reps: "pushups-weekly-min" },
  },
  {
    id: "situps",
    label: "Sit-ups",
    defaultMetric: "reps",
    metrics: { reps: "situps-weekly-min" },
  },
];

const METRIC_LABEL: Record<MovementMetric, string> = {
  sessions: "Sessions",
  minutes: "Minutes",
  miles: "Miles",
  reps: "Reps",
};

const PRESETS: Record<MovementMetric, Record<MovementPeriod, string[]>> = {
  sessions: { daily: ["1"], weekly: ["2", "3", "4", "5"] },
  minutes: { daily: ["20", "30", "45", "60"], weekly: ["30", "45", "60", "90", "150"] },
  miles: { daily: ["1", "2", "3", "5"], weekly: ["3", "5", "8", "10", "15"] },
  reps: { daily: ["20", "30", "50"], weekly: ["50", "100", "150", "200"] },
};

function metricOf(unit: string | undefined): MovementMetric {
  if (unit === "minutes" || unit === "miles" || unit === "reps") return unit;
  return "sessions";
}

type Props = {
  templates: GoalTemplate[];
  selected: Record<string, GoalScope>;
  targets: Record<string, string>;
  periods: Record<string, string>;
  locked: Set<string>;
  couple: boolean;
  onToggle: (template: GoalTemplate) => void;
  onScope: (slug: string, scope: GoalScope) => void;
  onTarget: (slug: string, value: string) => void;
  onPeriod: (slug: string, period: MovementPeriod) => void;
};

export function MovementPicker({
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
  const bySlug = new Map(templates.map((t) => [t.slug, t]));

  const families = FAMILIES.map((family) => {
    const members = (Object.entries(family.metrics) as [MovementMetric, string][])
      .map(([metric, slug]) => {
        const template = bySlug.get(slug);
        return template ? { metric, template } : null;
      })
      .filter((item): item is { metric: MovementMetric; template: GoalTemplate } => !!item);
    return { family, members };
  }).filter((item) => item.members.length > 0);

  const used = new Set(
    families.flatMap((item) => item.members.map((m) => m.template.slug))
  );
  const extras = templates.filter((t) => !used.has(t.slug));

  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>Activities</Text>
      <Text style={styles.hint}>
        Tap Running or Biking, then track minutes, miles, or sessions.
      </Text>
      <View style={styles.chips}>
        {families.map(({ family, members }) => {
          const isOn = members.some((m) => m.template.slug in selected);
          const glyph = templateGlyph(members[0].template);
          return (
            <Pressable
              key={family.id}
              onPress={() => {
                if (isOn) {
                  for (const m of members) {
                    if (m.template.slug in selected && !locked.has(m.template.slug)) {
                      onToggle(m.template);
                    }
                  }
                  return;
                }
                const preferred =
                  members.find((m) => m.metric === family.defaultMetric) ?? members[0];
                onToggle(preferred.template);
              }}
              style={[styles.chip, isOn && styles.chipOn]}
            >
              <Text style={styles.chipEmoji}>{glyph}</Text>
              <Text style={[styles.chipLabel, isOn && styles.chipLabelOn]}>
                {family.label}
              </Text>
            </Pressable>
          );
        })}
        {extras.map((template) => {
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
              <Text style={styles.chipEmoji}>{templateGlyph(template)}</Text>
              <Text style={[styles.chipLabel, isOn && styles.chipLabelOn]}>
                {template.category_name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {families.map(({ family, members }) => {
        const selectedMembers = members.filter((m) => m.template.slug in selected);
        if (!selectedMembers.length) return null;
        const glyph = templateGlyph(members[0].template);
        return (
          <View key={family.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardEmoji}>{glyph}</Text>
              <Text style={styles.cardName}>{family.label}</Text>
            </View>
            {members.length > 1 ? (
              <View style={styles.segment}>
                {members.map(({ metric, template }) => {
                  const on = template.slug in selected;
                  const isLocked = locked.has(template.slug);
                  return (
                    <Pressable
                      key={metric}
                      disabled={isLocked && on && selectedMembers.length === 1}
                      onPress={() => onToggle(template)}
                      style={[styles.segBtn, on && styles.segBtnOn]}
                    >
                      <Text style={[styles.segText, on && styles.segTextOn]}>
                        {METRIC_LABEL[metric]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {selectedMembers.map(({ metric, template }) => {
              const scope = selected[template.slug] ?? template.suggested_scope;
              const isLocked = locked.has(template.slug);
              const period = (periods[template.slug] === "daily" ? "daily" : "weekly") as MovementPeriod;
              const value =
                targets[template.slug] ?? formatTemplateTarget(template.target_value);
              const unit = quantityUnitLabel(template.category_unit || metric);
              const presets = PRESETS[metric][period];
              return (
                <View key={template.slug} style={styles.metricBlock}>
                  <View style={styles.metricHead}>
                    <Text style={styles.metricTitle}>
                      {METRIC_LABEL[metric]}
                    </Text>
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
                    {(["daily", "weekly"] as const).map((item) => {
                      const on = period === item;
                      return (
                        <Pressable
                          key={item}
                          onPress={() => onPeriod(template.slug, item)}
                          style={[styles.segBtn, on && styles.segBtnOn]}
                        >
                          <Text style={[styles.segText, on && styles.segTextOn]}>
                            {item === "daily" ? "Daily" : "Weekly"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.amountRow}>
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
                    <Text style={styles.unit}>{unit}</Text>
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
                            {preset} {unit}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}

      {extras
        .filter((template) => template.slug in selected)
        .map((template) => {
          const metric = metricOf(template.category_unit);
          const scope = selected[template.slug] ?? template.suggested_scope;
          const isLocked = locked.has(template.slug);
          const period = (periods[template.slug] === "daily" ? "daily" : "weekly") as MovementPeriod;
          const value =
            targets[template.slug] ?? formatTemplateTarget(template.target_value);
          const unit = quantityUnitLabel(template.category_unit || metric);
          return (
            <View key={template.slug} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardEmoji}>{templateGlyph(template)}</Text>
                <Text style={styles.cardName}>{template.category_name}</Text>
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
              <View style={styles.amountRow}>
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
                <Text style={styles.unit}>{unit}</Text>
              </View>
            </View>
          );
        })}
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
    gap: 12,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardEmoji: {
    fontSize: 24,
  },
  cardName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  metricBlock: {
    gap: 8,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  metricHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metricTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: colors.accentSoft,
    textTransform: "uppercase",
    letterSpacing: 0.6,
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
  amount: {
    flex: 1,
    fontSize: 32,
    fontWeight: "700",
    color: colors.text,
    padding: 0,
  },
  unit: {
    marginLeft: 8,
    fontSize: 18,
    fontWeight: "700",
    color: colors.accentSoft,
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
});
