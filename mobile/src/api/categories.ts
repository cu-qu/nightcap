import { apiRequest } from "@/src/api/client";
import type {
  Category,
  CategoryCreateInput,
  CategoryUpdateInput,
} from "@/src/types/api";

function asList<T>(data: T[] | { results: T[] }): T[] {
  return Array.isArray(data) ? data : data.results ?? [];
}

export type ListCategoriesParams = {
  group_key?: string;
  group?: number;
  ungrouped?: boolean;
};

export async function listCategories(
  params: ListCategoriesParams = {}
): Promise<Category[]> {
  const search = new URLSearchParams();
  if (params.group_key) search.set("group_key", params.group_key);
  if (params.group != null) search.set("group", String(params.group));
  if (params.ungrouped) search.set("ungrouped", "true");
  const qs = search.toString();
  const data = await apiRequest<Category[] | { results: Category[] }>(
    `/api/v1/categories/${qs ? `?${qs}` : ""}`
  );
  return asList(data);
}

export async function createCategory(
  input: CategoryCreateInput
): Promise<Category> {
  return apiRequest<Category>("/api/v1/categories/", {
    method: "POST",
    body: input,
  });
}

export async function updateCategory(
  id: number,
  input: CategoryUpdateInput
): Promise<Category> {
  return apiRequest<Category>(`/api/v1/categories/${id}/`, {
    method: "PATCH",
    body: input,
  });
}

/** Preferred remove action — never DELETE categories. */
export async function removeCategoryFromGroup(id: number): Promise<Category> {
  return apiRequest<Category>(`/api/v1/categories/${id}/remove-from-group/`, {
    method: "POST",
  });
}

export async function assignCategoryToGroup(
  id: number,
  groupId: number | null
): Promise<Category> {
  return updateCategory(id, { group: groupId });
}
