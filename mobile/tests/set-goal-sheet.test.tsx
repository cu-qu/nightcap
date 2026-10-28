import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import * as categoriesApi from "@/src/api/categories";
import { SetGoalSheet } from "@/src/components/SetGoalSheet";
import { useGroupsStore } from "@/src/store/groupsStore";
import type { Category, RitualCategoryGroup } from "@/src/types/api";
import type { GroupGoalItem } from "@/src/types/goals";

const category: Category = {
  id: 9,
  uuid: "cat-1",
  group: 1,
  group_uuid: "group-1",
  group_key: "follow_up",
  name: "Meditate",
  type: "habit",
  metric_kind: "boolean",
  unit: "count",
  icon: "custom",
  emoji: "🧘",
  sort_order: 0,
  is_default: false,
  created_at: "",
  updated_at: "",
};

const group: RitualCategoryGroup = {
  id: 1,
  uuid: "group-1",
  name: "Health",
  key: "follow_up",
  sort_order: 1,
  icon: "health",
  show_in_ritual: true,
  categories: [category],
};

const goal: GroupGoalItem = {
  uuid: "goal-1",
  id: 3,
  display_name: "Meditate",
  mode: "completed",
  health: "healthy",
  period: "weekly",
  direction: "min",
  target_value: "1",
  current_value: "0",
  remaining_value: "1",
  percent_used: 0,
  period_start: "2026-10-26",
  period_end: "2026-11-01",
  scope: "personal",
  category: {
    uuid: category.uuid,
    name: category.name,
    emoji: category.emoji ?? "",
    icon: category.icon,
    metric_kind: "boolean",
    unit: "count",
  },
};

describe("SetGoalSheet editing", () => {
  beforeEach(() => {
    useGroupsStore.setState({
      ritualGroups: [group],
      groups: [],
      ungrouped: [],
    });
    jest.mocked(categoriesApi.updateCategory).mockResolvedValue({
      ...category,
      metric_kind: "amount",
      unit: "usd",
    });
  });

  it("lets a did / did not goal become a dollar amount", async () => {
    const onSubmit = jest.fn(async () => undefined);
    await render(
      <SetGoalSheet
        visible
        initialPeriod="weekly"
        existingGoal={goal}
        onClose={() => undefined}
        onSubmit={onSubmit}
      />
    );

    expect(screen.queryByPlaceholderText("0")).toBeNull();

    await fireEvent.press(screen.getByTestId("measure-amount"));
    await fireEvent.press(screen.getByTestId("unit-usd"));
    expect(screen.getByText("Target ($)")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("goal-target"), "40");
    expect(screen.getByTestId("goal-target").props.value).toBe("40");
    await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(categoriesApi.updateCategory).toHaveBeenCalledWith(9, {
        metric_kind: "amount",
        unit: "usd",
      });
    });
    expect(onSubmit).toHaveBeenCalledWith({
      category_uuid: "cat-1",
      target_value: "40",
      period: "weekly",
      direction: "min",
    });
  });
});
