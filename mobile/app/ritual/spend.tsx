import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getNightCap } from "@/src/api/nightcaps";
import { MoodPicker } from "@/src/components/MoodPicker";
import { PrimaryButton, Screen } from "@/src/components/PrimaryButton";
import { RitualCategoryField } from "@/src/components/RitualCategoryField";
import { ShootingStarTransition } from "@/src/components/ShootingStarTransition";
import { enqueueRitual } from "@/src/db/sync";
import { useGroupsStore } from "@/src/store/groupsStore";
import { useRitualDraftStore } from "@/src/store/ritualDraftStore";
import { colors } from "@/src/theme/colors";
import { iconFor } from "@/src/theme/iconMap";
import type { Category, RitualCategoryGroup } from "@/src/types/api";
import { formatDisplayDate, isFutureIsoDate } from "@/src/utils/date";

const WRAP_TAB = "__wrap__";

function sortedCategories(group: RitualCategoryGroup): Category[] {
  return [...group.categories].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
  );
}

/**
 * NightCap entry — tabs per active group, plus Mood & reflection wrap-up.
 */
export default function NightCapEntryScreen() {
  const router = useRouter();
  const refreshRitual = useGroupsStore((s) => s.refreshRitual);
  const refresh = useGroupsStore((s) => s.refresh);
  const loading = useGroupsStore((s) => s.loading);
  const ritualGroups = useGroupsStore((s) => s.ritualGroups);
  const date = useRitualDraftStore((s) => s.date);
  const spendValues = useRitualDraftStore((s) => s.spendValues);
  const habitValues = useRitualDraftStore((s) => s.habitValues);
  const booleanValues = useRitualDraftStore((s) => s.booleanValues);
  const mood = useRitualDraftStore((s) => s.mood);
  const reflection = useRitualDraftStore((s) => s.reflection);
  const setCategoryValue = useRitualDraftStore((s) => s.setCategoryValue);
  const setMood = useRitualDraftStore((s) => s.setMood);
  const setReflection = useRitualDraftStore((s) => s.setReflection);
  const buildRitualPayload = useRitualDraftStore((s) => s.buildRitualPayload);
  const clear = useRitualDraftStore((s) => s.clear);
  const [saving, setSaving] = useState(false);
  const [starVisible, setStarVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  function valueFor(cat: Category): string | boolean {
    if (cat.metric_kind === "boolean") return !!booleanValues[cat.uuid];
    if (cat.type === "finance_expense") return spendValues[cat.uuid] ?? "";
    return habitValues[cat.uuid] ?? "";
  }

  const groups = useMemo(
    () =>
      [...ritualGroups].sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
      ),
    [ritualGroups]
  );

  const allCategories = useMemo(
    () => groups.flatMap((g) => sortedCategories(g)),
    [groups]
  );

  const tabIds = useMemo(
    () => [...groups.map((g) => g.uuid), WRAP_TAB],
    [groups]
  );

  useEffect(() => {
    if (!tabIds.length) {
      setActiveTab(null);
      return;
    }
    if (!activeTab || !tabIds.includes(activeTab)) {
      setActiveTab(tabIds[0]);
    }
  }, [tabIds, activeTab]);

  const isWrap = activeTab === WRAP_TAB;
  const activeGroup = isWrap
    ? null
    : (groups.find((g) => g.uuid === activeTab) ?? groups[0] ?? null);
  const activeCats = activeGroup ? sortedCategories(activeGroup) : [];
  const activeIndex = activeTab ? tabIds.indexOf(activeTab) : -1;
  const isLastTab = activeIndex >= 0 && activeIndex === tabIds.length - 1;

  useFocusEffect(
    useCallback(() => {
      void refreshRitual();
      if (!ritualGroups.length) void refresh();
      // Prefill mood/reflection when editing an existing NightCap.
      void (async () => {
        try {
          const nc = await getNightCap(date);
          if (nc.mood) setMood(nc.mood);
          if (nc.reflection) setReflection(nc.reflection);
        } catch {
          // No nightcap yet for this date.
        }
      })();
    }, [date, refresh, refreshRitual, ritualGroups.length, setMood, setReflection])
  );

  async function onSave() {
    if (saving || starVisible) return;
    if (isFutureIsoDate(date)) {
      Alert.alert(
        "Future date",
        "NightCap is only for today or earlier days."
      );
      return;
    }
    setSaving(true);
    try {
      const payload = buildRitualPayload(allCategories);
      await enqueueRitual(payload);
      clear();
      setStarVisible(true);
    } catch {
      Alert.alert(
        "Couldn’t save NightCap",
        "Your answers are kept locally. Try again when you’re online."
      );
    } finally {
      setSaving(false);
    }
  }

  const onStarTransition = useCallback(() => {
    router.replace("/(tabs)/calendar");
  }, [router]);

  const onStarFinished = useCallback(() => {
    setStarVisible(false);
  }, []);

  function onNext() {
    if (activeIndex < 0 || activeIndex >= tabIds.length - 1) return;
    setActiveTab(tabIds[activeIndex + 1]);
  }

  function filledCount(group: RitualCategoryGroup): number {
    return sortedCategories(group).filter((cat) => {
      const v = valueFor(cat);
      if (typeof v === "boolean") return v;
      return v.trim().length > 0;
    }).length;
  }

  const wrapFilled = !!(mood || reflection.trim());

  return (
    <Screen>
      <ShootingStarTransition
        visible={starVisible}
        onTransition={onStarTransition}
        onFinished={onStarFinished}
      />
      <View style={styles.header}>
        <Text style={styles.eyebrow}>NightCap</Text>
        <View style={styles.titleRow}>
          {mood ? <Text style={styles.headerMood}>{mood}</Text> : null}
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Tonight’s check-in</Text>
            <Text style={styles.subtitle}>{formatDisplayDate(date)}</Text>
          </View>
        </View>
      </View>

      {loading && !groups.length ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
        keyboardShouldPersistTaps="handled"
      >
        {groups.map((group) => {
          const selected = group.uuid === activeTab;
          const filled = filledCount(group);
          return (
            <Pressable
              key={group.uuid}
              onPress={() => setActiveTab(group.uuid)}
              style={[styles.tab, selected && styles.tabOn]}
            >
              <Text style={styles.tabEmoji}>{iconFor(group.icon)}</Text>
              <Text
                style={[styles.tabLabel, selected && styles.tabLabelOn]}
                numberOfLines={1}
              >
                {group.name}
              </Text>
              {filled > 0 ? (
                <View style={[styles.badge, selected && styles.badgeOn]}>
                  <Text style={styles.badgeText}>{filled}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setActiveTab(WRAP_TAB)}
          style={[styles.tab, isWrap && styles.tabOn]}
        >
          <Text style={styles.tabEmoji}>🌙</Text>
          <Text style={[styles.tabLabel, isWrap && styles.tabLabelOn]}>
            Wrap up
          </Text>
          {wrapFilled ? (
            <View style={[styles.badge, isWrap && styles.badgeOn]}>
              <Text style={styles.badgeText}>✓</Text>
            </View>
          ) : null}
        </Pressable>
      </ScrollView>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {activeGroup && !isWrap ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionEmoji}>
                {iconFor(activeGroup.icon)}
              </Text>
              <Text style={styles.sectionTitle}>{activeGroup.name}</Text>
            </View>

            {activeCats.length === 0 ? (
              <Text style={styles.emptySection}>
                No categories in this group yet.
              </Text>
            ) : (
              activeCats.map((cat) => (
                <RitualCategoryField
                  key={cat.uuid}
                  category={cat}
                  value={valueFor(cat)}
                  onChange={(v) => setCategoryValue(cat, v)}
                />
              ))
            )}
          </>
        ) : null}

        {isWrap ? (
          <View style={styles.wrapSection}>
            <Text style={styles.sectionTitle}>How was your day?</Text>
            <Text style={styles.wrapHint}>Pick a mood for tonight</Text>
            <MoodPicker value={mood} onChange={setMood} />

            <Text style={[styles.sectionTitle, { marginTop: 28 }]}>
              Reflection
            </Text>
            <Text style={styles.wrapHint}>
              A note for tonight — optional, just for you.
            </Text>
            <TextInput
              value={reflection}
              onChangeText={setReflection}
              placeholder="What stood out today?"
              placeholderTextColor={colors.muted}
              multiline
              textAlignVertical="top"
              style={styles.reflectionInput}
            />
          </View>
        ) : null}

        {!loading && !groups.length && !isWrap ? (
          <Text style={styles.empty}>
            No active groups for NightCap. You can still wrap up with mood and
            reflection — or turn on groups in Settings → Categories & Groups.
          </Text>
        ) : null}

        <View style={styles.cta}>
          {!isLastTab ? (
            <PrimaryButton title="Next" onPress={onNext} />
          ) : null}
          <PrimaryButton
            title="Save NightCap"
            onPress={() => void onSave()}
            loading={saving}
            variant={!isLastTab ? "secondary" : "primary"}
          />
          <Text style={styles.hint}>
            {isWrap
              ? "Mood and reflection save with your NightCap"
              : "Switch tabs anytime · Save submits everything"}
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 16,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.accentSoft,
  },
  titleRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerMood: {
    fontSize: 40,
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 16,
    color: colors.muted,
  },
  tabBar: {
    flexGrow: 0,
    marginTop: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tabBarContent: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 10,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    maxWidth: 220,
  },
  tabOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.25)",
  },
  tabEmoji: {
    fontSize: 16,
  },
  tabLabel: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
  },
  tabLabelOn: {
    color: colors.accentSoft,
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.border,
  },
  badgeOn: {
    backgroundColor: colors.accent,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  sectionEmoji: {
    fontSize: 22,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  emptySection: {
    marginTop: 12,
    fontSize: 14,
    color: colors.muted,
  },
  wrapSection: {
    gap: 4,
  },
  wrapHint: {
    marginTop: 6,
    marginBottom: 12,
    fontSize: 14,
    color: colors.muted,
  },
  reflectionInput: {
    minHeight: 140,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    lineHeight: 22,
  },
  empty: {
    marginTop: 24,
    textAlign: "center",
    color: colors.muted,
    lineHeight: 22,
  },
  cta: {
    marginTop: 28,
    gap: 12,
  },
  hint: {
    marginTop: 4,
    textAlign: "center",
    fontSize: 12,
    color: colors.muted,
  },
});
