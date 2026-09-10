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
import { getSharedRitual } from "@/src/api/ritual";
import { MoodPicker } from "@/src/components/MoodPicker";
import { PrimaryButton, Screen } from "@/src/components/PrimaryButton";
import { RitualCategoryField } from "@/src/components/RitualCategoryField";
import { RitualMomentsSection } from "@/src/components/RitualMomentsSection";
import { ShootingStarTransition } from "@/src/components/ShootingStarTransition";
import { enqueueRitual } from "@/src/db/sync";
import { useAuthStore } from "@/src/store/authStore";
import { useGroupsStore } from "@/src/store/groupsStore";
import { useRitualDraftStore } from "@/src/store/ritualDraftStore";
import { colors } from "@/src/theme/colors";
import { iconFor } from "@/src/theme/iconMap";
import type {
  Category,
  RitualCategoryGroup,
  SharedRitualHint,
  SharedRitualResponse,
} from "@/src/types/api";
import { formatDisplayDate, isFutureIsoDate } from "@/src/utils/date";
import { categorySupportsCompletedWith } from "@/src/utils/ritualCategories";

const WRAP_TAB = "__wrap__";
const MOMENTS_TAB = "__moments__";

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
  const completedWith = useRitualDraftStore((s) => s.completedWith);
  const mood = useRitualDraftStore((s) => s.mood);
  const reflection = useRitualDraftStore((s) => s.reflection);
  const favoriteMoment = useRitualDraftStore((s) => s.favoriteMoment);
  const favoritePhotoUri = useRitualDraftStore((s) => s.favoritePhotoUri);
  const hasRemotePhoto = useRitualDraftStore((s) => s.hasRemotePhoto);
  const setCategoryValue = useRitualDraftStore((s) => s.setCategoryValue);
  const setCompletedWith = useRitualDraftStore((s) => s.setCompletedWith);
  const setMood = useRitualDraftStore((s) => s.setMood);
  const setReflection = useRitualDraftStore((s) => s.setReflection);
  const setFavoriteMoment = useRitualDraftStore((s) => s.setFavoriteMoment);
  const setFavoritePhoto = useRitualDraftStore((s) => s.setFavoritePhoto);
  const clearFavoritePhoto = useRitualDraftStore((s) => s.clearFavoritePhoto);
  const applySavedNightCap = useRitualDraftStore((s) => s.applySavedNightCap);
  const buildRitualPayload = useRitualDraftStore((s) => s.buildRitualPayload);
  const clear = useRitualDraftStore((s) => s.clear);
  const [saving, setSaving] = useState(false);
  const [starVisible, setStarVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [sharedRitual, setSharedRitual] = useState<SharedRitualResponse | null>(
    null
  );
  const hasPartner = !!useAuthStore((s) => s.user?.partnership);

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
    () => [...groups.map((g) => g.uuid), MOMENTS_TAB, WRAP_TAB],
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
  const isMoments = activeTab === MOMENTS_TAB;
  const activeGroup = isWrap || isMoments
    ? null
    : (groups.find((g) => g.uuid === activeTab) ?? groups[0] ?? null);
  const activeCats = activeGroup ? sortedCategories(activeGroup) : [];
  const activeIndex = activeTab ? tabIds.indexOf(activeTab) : -1;
  const isLastTab = activeIndex >= 0 && activeIndex === tabIds.length - 1;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setReady(false);
      void (async () => {
        try {
          await refreshRitual();
          if (cancelled) return;
          const nc = await getNightCap(date);
          if (cancelled) return;
          const categories = useGroupsStore
            .getState()
            .ritualGroups.flatMap((g) => g.categories);
          applySavedNightCap(nc, categories);
        } catch {
          // No nightcap yet for this date.
        } finally {
          if (!cancelled) setReady(true);
        }
      })();
      void (async () => {
        try {
          const shared = await getSharedRitual(date);
          if (!cancelled) setSharedRitual(shared);
        } catch {
          if (!cancelled) setSharedRitual(null);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [date, refresh, refreshRitual, applySavedNightCap])
  );

  const togetherIds = useMemo(
    () => new Set(sharedRitual?.shared_category_uuids ?? []),
    [sharedRitual]
  );
  const partnerHintByCategory = useMemo(() => {
    const map = new Map<string, SharedRitualHint>();
    for (const hint of sharedRitual?.entries ?? []) {
      map.set(hint.category_uuid, hint);
    }
    return map;
  }, [sharedRitual]);

  async function onSave() {
    if (saving || starVisible || !ready) return;
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
  const momentsFilled = !!(
    favoriteMoment.trim() ||
    favoritePhotoUri ||
    hasRemotePhoto
  );

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
          onPress={() => setActiveTab(MOMENTS_TAB)}
          style={[styles.tab, isMoments && styles.tabOn]}
        >
          <Text style={styles.tabEmoji}>✨</Text>
          <Text style={[styles.tabLabel, isMoments && styles.tabLabelOn]}>
            Moments
          </Text>
          {momentsFilled ? (
            <View style={[styles.badge, isMoments && styles.badgeOn]}>
              <Text style={styles.badgeText}>✓</Text>
            </View>
          ) : null}
        </Pressable>
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
        {activeGroup && !isWrap && !isMoments ? (
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
                  together={togetherIds.has(cat.uuid)}
                  partnerHint={partnerHintByCategory.get(cat.uuid) ?? null}
                  showCompletedWith={
                    hasPartner && categorySupportsCompletedWith(cat)
                  }
                  completedWith={completedWith[cat.uuid] ?? "alone"}
                  onCompletedWithChange={(v) => setCompletedWith(cat.uuid, v)}
                />
              ))
            )}
          </>
        ) : null}

        {isMoments ? (
          <RitualMomentsSection
            date={date}
            favoriteMoment={favoriteMoment}
            onChangeMoment={setFavoriteMoment}
            localPhotoUri={favoritePhotoUri}
            hasRemotePhoto={hasRemotePhoto}
            photoCacheKey={date}
            onPickedPhoto={setFavoritePhoto}
            onClearPhoto={clearFavoritePhoto}
          />
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

        {!loading && !groups.length && !isWrap && !isMoments ? (
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
            loading={saving || !ready}
            variant={!isLastTab ? "secondary" : "primary"}
          />
          <Text style={styles.hint}>
            {isWrap
              ? "Mood and reflection save with your NightCap"
              : isMoments
                ? "Photo uploads with Save NightCap"
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
