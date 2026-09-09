import { apiRequest } from "@/src/api/client";
import type {
  CategoryGroup,
  CategoryGroupCreateInput,
  CategoryGroupUpdateInput,
  RitualCategoryGroup,
} from "@/src/types/api";

function asList<T>(data: T[] | { results: T[] }): T[] {
  return Array.isArray(data) ? data : data.results ?? [];
}

export async function listGroups(): Promise<CategoryGroup[]> {
  const data = await apiRequest<CategoryGroup[] | { results: CategoryGroup[] }>(
    "/api/v1/category-groups/"
  );
  return asList(data);
}

export async function listGroupsForRitual(): Promise<RitualCategoryGroup[]> {
  const data = await apiRequest<
    RitualCategoryGroup[] | { results: RitualCategoryGroup[] }
  >("/api/v1/category-groups/for-ritual/");
  return asList(data);
}

export async function getGroup(id: number): Promise<CategoryGroup> {
  return apiRequest<CategoryGroup>(`/api/v1/category-groups/${id}/`);
}

export async function createGroup(
  input: CategoryGroupCreateInput
): Promise<CategoryGroup> {
  return apiRequest<CategoryGroup>("/api/v1/category-groups/", {
    method: "POST",
    body: input,
  });
}

export async function updateGroup(
  id: number,
  input: CategoryGroupUpdateInput
): Promise<CategoryGroup> {
  return apiRequest<CategoryGroup>(`/api/v1/category-groups/${id}/`, {
    method: "PATCH",
    body: input,
  });
}

/** Deletes a non-default group; categories are detached, not deleted. */
export async function deleteGroup(id: number): Promise<void> {
  await apiRequest<void>(`/api/v1/category-groups/${id}/`, {
    method: "DELETE",
  });
}
