import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { PrimaryButton } from "@/src/components/PrimaryButton";
import { EmojiPicker } from "@/src/components/EmojiPicker";
import { colors } from "@/src/theme/colors";
import {
  GENERAL_UNIT_OPTIONS,
  unitOptionsForGroupKey,
  type UnitOption,
} from "@/src/theme/unitOptions";
import type { CategoryCreateInput, CategoryGroup } from "@/src/types/api";
import { SPEND_GROUP_KEY } from "@/src/types/api";

const NO_GROUP = -1;
const DEFAULT_EMOJI = "✨";


type Props = {
  visible: boolean;
  group: CategoryGroup | null;
  /** When group is null, user can pick a group or leave ungrouped */
  groups?: CategoryGroup[];
  /** Pre-select a group when `group` is null (picker mode). */
  initialGroupId?: number | null;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (input: CategoryCreateInput) => Promise<void>;
};

export function AddCategoryModal({
  visible,
  group,
  groups = [],
  initialGroupId = null,
  loading,
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(DEFAULT_EMOJI);
  const [unitId, setUnitId] = useState<string>("minutes");
  /** null when fixed `group` prop; otherwise group id or NO_GROUP */
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(
    NO_GROUP
  );

  const pickGroup = !group;
  const isUngrouped = pickGroup && selectedGroupId === NO_GROUP;

  const activeGroup = useMemo(() => {
    if (group) return group;
    if (selectedGroupId == null || selectedGroupId === NO_GROUP) return null;
    return groups.find((g) => g.id === selectedGroupId) ?? null;
  }, [group, groups, selectedGroupId]);

  const units = useMemo(() => {
    if (isUngrouped || !activeGroup) return GENERAL_UNIT_OPTIONS;
    return unitOptionsForGroupKey(activeGroup.key);
  }, [activeGroup, isUngrouped]);

  const selectedUnit: UnitOption | undefined =
    units.find((u) => u.id === unitId) ?? units[0];

  useEffect(() => {
    if (!visible) return;
    setName("");
    setEmoji(DEFAULT_EMOJI);
    if (group) {
      setSelectedGroupId(group.id);
      setEmoji(group.key === SPEND_GROUP_KEY ? "🛒" : DEFAULT_EMOJI);
      const opts = unitOptionsForGroupKey(group.key);
      setUnitId(opts[0]?.id ?? "usd");
    } else {
      const startId =
        initialGroupId != null && groups.some((g) => g.id === initialGroupId)
          ? initialGroupId
          : NO_GROUP;
      setSelectedGroupId(startId);
      const startGroup =
        startId === NO_GROUP
          ? null
          : groups.find((g) => g.id === startId) ?? null;
      if (startGroup) {
        setEmoji(startGroup.key === SPEND_GROUP_KEY ? "🛒" : DEFAULT_EMOJI);
        const opts = unitOptionsForGroupKey(startGroup.key);
        setUnitId(opts[0]?.id ?? "usd");
      } else {
        setUnitId(GENERAL_UNIT_OPTIONS[1]?.id ?? "minutes");
      }
    }
  }, [visible, group, initialGroupId]);

  useEffect(() => {
    if (!units.some((u) => u.id === unitId)) {
      setUnitId(units[0]?.id ?? "usd");
    }
  }, [units, unitId]);

  const canSubmit =
    !!name.trim() &&
    !!selectedUnit &&
    (pickGroup ? selectedGroupId != null : !!group);

  async function handleSubmit() {
    if (!canSubmit || !selectedUnit) return;
    const groupId = group
      ? group.id
      : selectedGroupId === NO_GROUP
        ? null
        : selectedGroupId;
    await onSubmit({
      name: name.trim(),
      type: selectedUnit.type,
      metric_kind: selectedUnit.metric_kind,
      unit: selectedUnit.unit,
      // Backend: `icon` = stable key, `emoji` = display glyph to store
      icon: "custom",
      emoji,
      group: groupId,
    });
  }

  const titleTarget = group
    ? group.key === SPEND_GROUP_KEY
      ? "Spend"
      : group.name
    : isUngrouped
      ? "No group"
      : activeGroup?.key === SPEND_GROUP_KEY
        ? "Spend"
        : activeGroup?.name ?? "a group";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Add category</Text>
          <Text style={styles.subtitle}>to {titleTarget}</Text>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
          >
            {pickGroup ? (
              <View style={styles.block}>
                <Text style={styles.label}>Group</Text>
                <View style={styles.chipWrap}>
                  <Pressable
                    onPress={() => setSelectedGroupId(NO_GROUP)}
                    style={[styles.chip, isUngrouped && styles.chipOn]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        isUngrouped && styles.chipTextOn,
                      ]}
                    >
                      No group
                    </Text>
                  </Pressable>
                  {groups.map((g) => {
                    const selected = g.id === selectedGroupId;
                    const label =
                      g.key === SPEND_GROUP_KEY ? "Spend" : g.name;
                    return (
                      <Pressable
                        key={g.uuid}
                        onPress={() => setSelectedGroupId(g.id)}
                        style={[styles.chip, selected && styles.chipOn]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            selected && styles.chipTextOn,
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={styles.block}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Coffee runs"
                placeholderTextColor={colors.muted}
                style={styles.input}
                autoFocus
              />
            </View>

            <View style={styles.block}>
              <Text style={styles.label}>Emoji</Text>
              <EmojiPicker value={emoji} onChange={setEmoji} />
            </View>

            <View style={styles.block}>
              <Text style={styles.label}>Unit</Text>
              <View style={styles.chipWrap}>
                {units.map((u) => {
                  const selected = selectedUnit?.id === u.id;
                  return (
                    <Pressable
                      key={u.id}
                      onPress={() => setUnitId(u.id)}
                      style={[styles.chip, selected && styles.chipOn]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selected && styles.chipTextOn,
                        ]}
                      >
                        {u.chip}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {selectedUnit ? (
                <Text style={styles.unitHint}>{selectedUnit.label}</Text>
              ) : null}
              {activeGroup?.key === SPEND_GROUP_KEY ? (
                <Text style={styles.unitHint}>
                  Spend only accepts money (dollar) categories.
                </Text>
              ) : null}
              {isUngrouped ? (
                <Text style={styles.unitHint}>
                  No group — any unit is allowed. You can assign a group later.
                </Text>
              ) : null}
            </View>
          </ScrollView>

          <PrimaryButton
            title="Add category"
            loading={loading}
            disabled={!canSubmit}
            onPress={() => void handleSubmit()}
          />
          <Pressable onPress={onClose} style={styles.cancel} hitSlop={8}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  card: {
    maxHeight: "92%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 14,
    color: colors.muted,
  },
  scroll: {
    maxHeight: 420,
    marginBottom: 12,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  block: {
    marginBottom: 18,
  },
  label: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.25)",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  chipTextOn: {
    color: colors.accentSoft,
  },
  unitHint: {
    marginTop: 8,
    fontSize: 12,
    color: colors.muted,
  },
  cancel: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.accentSoft,
  },
});
