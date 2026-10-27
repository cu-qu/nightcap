import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AddCategoryModal } from "@/src/components/AddCategoryModal";
import { EmojiPicker } from "@/src/components/EmojiPicker";
import { PrimaryButton, Screen } from "@/src/components/PrimaryButton";
import { useGroupsStore } from "@/src/store/groupsStore";
import { colors } from "@/src/theme/colors";
import { categoryGlyph, iconFor } from "@/src/theme/iconMap";
import type { Category, CategoryCreateInput, CategoryGroup } from "@/src/types/api";
import { SPEND_GROUP_KEY } from "@/src/types/api";
import { categoryKindLabel } from "@/src/utils/units";

function slugKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

type EditTarget =
  | { kind: "group"; group: CategoryGroup }
  | { kind: "category"; category: Category }
  | null;

export default function CategoriesGroupsScreen() {
  const groups = useGroupsStore((s) => s.groups);
  const ungrouped = useGroupsStore((s) => s.ungrouped);
  const loading = useGroupsStore((s) => s.loading);
  const refresh = useGroupsStore((s) => s.refresh);
  const createGroup = useGroupsStore((s) => s.createGroup);
  const updateGroup = useGroupsStore((s) => s.updateGroup);
  const deleteGroup = useGroupsStore((s) => s.deleteGroup);
  const createCategory = useGroupsStore((s) => s.createCategory);
  const updateCategory = useGroupsStore((s) => s.updateCategory);
  const removeFromGroup = useGroupsStore((s) => s.removeFromGroup);
  const assignToGroup = useGroupsStore((s) => s.assignToGroup);

  const [newGroupName, setNewGroupName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [editName, setEditName] = useState("");
  const [editEmoji, setEditEmoji] = useState("✨");
  const [addForGroup, setAddForGroup] = useState<CategoryGroup | null>(null);
  const [addFromBottom, setAddFromBottom] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  async function onCreateGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    const key = slugKey(name);
    if (!key) {
      Alert.alert("Invalid name", "Enter a name with letters or numbers.");
      return;
    }
    setBusy(true);
    try {
      const nextOrder =
        groups.reduce((max, g) => Math.max(max, g.sort_order), 0) + 1;
      await createGroup({
        name,
        key,
        sort_order: nextOrder,
        icon: "custom",
        show_in_ritual: true,
      });
      setNewGroupName("");
    } catch (e) {
      Alert.alert(
        "Could not create group",
        e instanceof Error ? e.message : "Try again"
      );
    } finally {
      setBusy(false);
    }
  }

  async function onAddCategory(input: CategoryCreateInput) {
    setBusy(true);
    try {
      await createCategory(input);
      setAddForGroup(null);
      setAddFromBottom(false);
    } catch (e) {
      Alert.alert(
        "Could not create category",
        e instanceof Error ? e.message : "Try again"
      );
    } finally {
      setBusy(false);
    }
  }

  function confirmDeleteGroup(group: CategoryGroup) {
    if (group.is_default) {
      Alert.alert(
        "Default group",
        "Default groups like Spend cannot be deleted."
      );
      return;
    }
    Alert.alert(
      "Delete group?",
      `“${group.name}” will be removed. Categories in it become ungrouped — they are not deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete group",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await deleteGroup(group.id);
              } catch (e) {
                Alert.alert(
                  "Delete failed",
                  e instanceof Error ? e.message : "Try again"
                );
              }
            })();
          },
        },
      ]
    );
  }

  function confirmRemoveCategory(cat: Category) {
    Alert.alert(
      "Remove from group?",
      `“${cat.name}” will leave this group and appear under Ungrouped. It will not be deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          onPress: () => {
            void (async () => {
              try {
                await removeFromGroup(cat.id);
              } catch (e) {
                Alert.alert(
                  "Remove failed",
                  e instanceof Error ? e.message : "Try again"
                );
              }
            })();
          },
        },
      ]
    );
  }

  function openRenameGroup(group: CategoryGroup) {
    setEditTarget({ kind: "group", group });
    setEditName(group.name);
    setEditEmoji(iconFor(group.icon));
  }

  function openEditCategory(cat: Category) {
    setEditTarget({ kind: "category", category: cat });
    setEditName(cat.name);
    setEditEmoji(categoryGlyph(cat));
  }

  async function saveEdit() {
    const name = editName.trim();
    if (!name || !editTarget) return;
    setBusy(true);
    try {
      if (editTarget.kind === "group") {
        await updateGroup(editTarget.group.id, { name, icon: editEmoji });
      } else {
        await updateCategory(editTarget.category.id, {
          name,
          emoji: editEmoji,
        });
      }
      setEditTarget(null);
    } catch (e) {
      Alert.alert(
        "Save failed",
        e instanceof Error ? e.message : "Try again"
      );
    } finally {
      setBusy(false);
    }
  }

  function moveCategory(cat: Category) {
    const targets = groups.filter((g) => g.id !== cat.group);
    if (!targets.length) {
      Alert.alert("No other groups", "Create another group first.");
      return;
    }
    Alert.alert("Move to group", cat.name, [
      ...targets.map((g) => ({
        text: g.key === SPEND_GROUP_KEY ? "Spend" : g.name,
        onPress: () => {
          void assignToGroup(cat.id, g.id).catch((e) =>
            Alert.alert(
              "Move failed",
              e instanceof Error ? e.message : "Try again"
            )
          );
        },
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  function addUngrouped(cat: Category) {
    Alert.alert("Add to group", cat.name, [
      ...groups.map((g) => ({
        text:
          g.key === SPEND_GROUP_KEY ? "Add to Spend" : `Add to ${g.name}`,
        onPress: () => {
          if (g.key === SPEND_GROUP_KEY && cat.metric_kind !== "amount") {
            Alert.alert(
              "Spend is money-only",
              "Only amount/currency categories can be added to Spend."
            );
            return;
          }
          void assignToGroup(cat.id, g.id).catch((e) =>
            Alert.alert(
              "Assign failed",
              e instanceof Error ? e.message : "Try again"
            )
          );
        },
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  async function moveGroupOrder(group: CategoryGroup, direction: -1 | 1) {
    const ordered = [...groups].sort((a, b) => a.sort_order - b.sort_order);
    const idx = ordered.findIndex((g) => g.id === group.id);
    const swap = ordered[idx + direction];
    if (!swap) return;
    try {
      await Promise.all([
        updateGroup(group.id, { sort_order: swap.sort_order }),
        updateGroup(swap.id, { sort_order: group.sort_order }),
      ]);
    } catch (e) {
      Alert.alert(
        "Reorder failed",
        e instanceof Error ? e.message : "Try again"
      );
    }
  }

  const addModalVisible = !!addForGroup || addFromBottom;
  const addModalGroup = addForGroup;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Configure which categories appear in each NightCap group. Categories
          are never deleted — only removed from a group.
        </Text>

        {loading && !groups.length ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
        ) : null}

        <Text style={styles.section}>Groups</Text>
        {groups.map((group, index) => {
          const label =
            group.key === SPEND_GROUP_KEY ? "Spend" : group.name;
          const members = [...(group.categories ?? [])].sort(
            (a, b) =>
              a.sort_order - b.sort_order || a.name.localeCompare(b.name)
          );
          return (
            <View key={group.uuid} style={styles.groupCard}>
              <View style={styles.groupHeader}>
                <Pressable
                  onPress={() => openRenameGroup(group)}
                  style={styles.flex}
                >
                  <Text style={styles.groupTitle}>
                    {categoryGlyph({ icon: group.icon })} {label}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.rowActions}>
                <Pressable
                  onPress={() => openRenameGroup(group)}
                  style={styles.smallBtn}
                >
                  <Text style={styles.smallBtnText}>Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() => void moveGroupOrder(group, -1)}
                  disabled={index === 0}
                  style={[styles.smallBtn, index === 0 && styles.disabled]}
                >
                  <Text style={styles.smallBtnText}>Up</Text>
                </Pressable>
                <Pressable
                  onPress={() => void moveGroupOrder(group, 1)}
                  disabled={index === groups.length - 1}
                  style={[
                    styles.smallBtn,
                    index === groups.length - 1 && styles.disabled,
                  ]}
                >
                  <Text style={styles.smallBtnText}>Down</Text>
                </Pressable>
                {!group.is_default ? (
                  <Pressable
                    onPress={() => confirmDeleteGroup(group)}
                    style={styles.smallBtnDanger}
                  >
                    <Text style={styles.smallBtnDangerText}>Delete</Text>
                  </Pressable>
                ) : null}
              </View>

              {members.map((cat) => (
                <View key={cat.uuid} style={styles.catRow}>
                  <Pressable
                    style={styles.catMain}
                    onPress={() => openEditCategory(cat)}
                  >
                    <Text style={styles.emoji}>{categoryGlyph(cat)}</Text>
                    <View style={styles.flex}>
                      <Text style={styles.catName}>{cat.name}</Text>
                      {categoryKindLabel(cat) ? (
                        <Text style={styles.catMeta}>
                          {categoryKindLabel(cat)}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => moveCategory(cat)}
                    hitSlop={6}
                    style={styles.iconBtn}
                  >
                    <Text style={styles.iconBtnText}>Move</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => confirmRemoveCategory(cat)}
                    hitSlop={6}
                    style={styles.iconBtn}
                  >
                    <Text style={styles.iconBtnText}>Remove</Text>
                  </Pressable>
                </View>
              ))}
              {!members.length ? (
                <Text style={styles.empty}>No categories in this group</Text>
              ) : null}

              <Pressable
                onPress={() => {
                  setAddFromBottom(false);
                  setAddForGroup(group);
                }}
                style={styles.addCategoryBtn}
              >
                <Text style={styles.addCategoryBtnText}>+ Add category</Text>
              </Pressable>
            </View>
          );
        })}

        <Text style={styles.section}>Create custom group</Text>
        <TextInput
          value={newGroupName}
          onChangeText={setNewGroupName}
          placeholder="Group name"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <PrimaryButton
          title="Create group"
          loading={busy}
          disabled={!newGroupName.trim()}
          onPress={() => void onCreateGroup()}
        />

        <Text style={[styles.section, { marginTop: 32 }]}>Ungrouped</Text>
        <Text style={styles.intro}>
          Categories removed from a group land here. Reassign them anytime.
        </Text>
        {ungrouped.map((cat) => (
          <View key={cat.uuid} style={styles.catRow}>
            <Pressable
              style={styles.catMain}
              onPress={() => openEditCategory(cat)}
            >
              <Text style={styles.emoji}>{categoryGlyph(cat)}</Text>
              <View style={styles.flex}>
                <Text style={styles.catName}>{cat.name}</Text>
                {categoryKindLabel(cat) ? (
                  <Text style={styles.catMeta}>
                    {categoryKindLabel(cat)}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            <Pressable
              onPress={() => addUngrouped(cat)}
              style={styles.smallBtn}
            >
              <Text style={styles.smallBtnText}>Add to…</Text>
            </Pressable>
          </View>
        ))}
        {!ungrouped.length ? (
          <Text style={styles.empty}>No ungrouped categories</Text>
        ) : null}

        <View style={styles.bottomAdd}>
          <PrimaryButton
            title="+ Add category"
            onPress={() => {
              setAddForGroup(null);
              setAddFromBottom(true);
            }}
          />
        </View>
      </ScrollView>

      <AddCategoryModal
        visible={addModalVisible}
        group={addModalGroup}
        groups={groups}
        loading={busy}
        onClose={() => {
          setAddForGroup(null);
          setAddFromBottom(false);
        }}
        onSubmit={onAddCategory}
      />

      <Modal
        visible={!!editTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setEditTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
            <Text style={styles.modalTitle}>
              {editTarget?.kind === "group"
                ? "Edit group"
                : "Edit category"}
            </Text>
            <Text style={styles.modalLabel}>Name</Text>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              style={styles.input}
              placeholderTextColor={colors.muted}
            />
            <Text style={styles.modalLabel}>Emoji</Text>
            <View style={styles.emojiPickerWrap}>
              <EmojiPicker value={editEmoji} onChange={setEditEmoji} />
            </View>
            <PrimaryButton
              title="Save"
              loading={busy}
              disabled={!editName.trim()}
              onPress={() => void saveEdit()}
            />
            <Pressable
              onPress={() => setEditTarget(null)}
              style={styles.modalCancel}
            >
              <Text style={styles.smallBtnText}>Cancel</Text>
            </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 48,
  },
  intro: {
    marginBottom: 16,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  section: {
    marginBottom: 12,
    marginTop: 8,
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  groupCard: {
    marginBottom: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  groupTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  rowActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  smallBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  smallBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.accentSoft,
  },
  smallBtnDanger: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  smallBtnDangerText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.danger,
  },
  disabled: {
    opacity: 0.4,
  },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: colors.elevated,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  catMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  emoji: {
    fontSize: 18,
  },
  flex: {
    flex: 1,
  },
  catName: {
    fontWeight: "600",
    color: colors.text,
  },
  catMeta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.muted,
  },
  iconBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  iconBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.accentSoft,
  },
  empty: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 8,
  },
  addCategoryBtn: {
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    borderStyle: "dashed",
    backgroundColor: "rgba(139, 92, 246, 0.12)",
    paddingVertical: 12,
  },
  addCategoryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.accentSoft,
  },
  bottomAdd: {
    marginTop: 28,
  },
  input: {
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    maxHeight: "88%",
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  modalTitle: {
    marginBottom: 12,
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  modalLabel: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  emojiPickerWrap: {
    marginBottom: 16,
  },
  modalCancel: {
    marginTop: 14,
    alignItems: "center",
    paddingVertical: 8,
  },
});
