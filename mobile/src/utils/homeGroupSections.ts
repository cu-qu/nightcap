import type { CategoryGroup, RitualCategoryGroup } from "@/src/types/api";
import type {
  CategoryGroupGoalBucket,
  GoalHealthCounts,
  GoalMetrics,
  GroupGoalItem,
  GroupGoalSummary,
} from "@/src/types/goals";
import type { GroupPeriodSummary } from "@/src/utils/groupSummary";

export type HomeGroupSection = {
  id: string;
  uuid: string | null;
  key: string | null;
  name: string;
  icon: string;
  activity: GroupPeriodSummary | null;
  goals: GroupGoalItem[];
  goalCounts: GoalHealthCounts;
  metrics: GoalMetrics | null;
};

function idOf(parts: {
  uuid?: string | null;
  key?: string | null;
  name?: string;
}): string {
  return parts.uuid ?? parts.key ?? parts.name ?? "group";
}

function emptyCounts(): GoalHealthCounts {
  return {
    total: 0,
    healthy: 0,
    close: 0,
    behind: 0,
    passed: 0,
    over: 0,
  };
}

function fromBucket(bucket?: CategoryGroupGoalBucket) {
  return {
    goals: bucket?.goals ?? [],
    goalCounts: bucket?.counts ?? emptyCounts(),
    metrics: bucket?.metrics ?? null,
  };
}

/**
 * Merge the user's active groups with period activity + goals.
 * Prefers ritual/show-in-ritual groups, falls back to all groups.
 */
export function buildHomeGroupSections(params: {
  ritualGroups: RitualCategoryGroup[];
  groups: CategoryGroup[];
  activity: GroupPeriodSummary[];
  goalSummary: GroupGoalSummary | null;
}): HomeGroupSection[] {
  const { ritualGroups, groups, activity, goalSummary } = params;

  const activityById = new Map(activity.map((a) => [a.id, a]));
  const goalsById = new Map<string, CategoryGroupGoalBucket>();
  for (const g of goalSummary?.groups ?? []) {
    goalsById.set(idOf(g), g);
  }

  const base =
    ritualGroups.length > 0
      ? ritualGroups.map((g) => ({
          uuid: g.uuid,
          key: g.key,
          name: g.name,
          icon: g.icon,
          sort: g.sort_order,
        }))
      : groups.map((g) => ({
          uuid: g.uuid,
          key: g.key,
          name: g.name,
          icon: g.icon,
          sort: g.sort_order,
        }));

  const seen = new Set<string>();
  const sections: HomeGroupSection[] = [];

  const sortedBase = [...base].sort(
    (a, b) => a.sort - b.sort || a.name.localeCompare(b.name)
  );

  for (const g of sortedBase) {
    const id = idOf(g);
    if (seen.has(id)) continue;
    seen.add(id);
    const bucket =
      goalsById.get(id) ??
      (g.key
        ? [...goalsById.values()].find((b) => b.key === g.key)
        : undefined);
    const act =
      activityById.get(id) ??
      (g.key ? activity.find((a) => a.key === g.key) : undefined) ??
      null;
    const goalBits = fromBucket(bucket);
    sections.push({
      id,
      uuid: g.uuid,
      key: g.key,
      name: g.name,
      icon: g.icon,
      activity: act,
      ...goalBits,
    });
  }

  for (const a of activity) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    const bucket = goalsById.get(a.id);
    sections.push({
      id: a.id,
      uuid: a.uuid,
      key: a.key,
      name: a.name,
      icon: a.icon,
      activity: a,
      ...fromBucket(bucket),
    });
  }

  for (const [id, bucket] of goalsById) {
    if (seen.has(id)) continue;
    seen.add(id);
    sections.push({
      id,
      uuid: bucket.uuid,
      key: bucket.key,
      name: bucket.name,
      icon: bucket.icon,
      activity: null,
      ...fromBucket(bucket),
    });
  }

  return sections;
}
