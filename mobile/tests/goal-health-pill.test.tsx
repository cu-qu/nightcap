import { render, screen } from "@testing-library/react-native";

import { GoalHealthPill } from "@/src/components/GoalHealthPill";
import type { GroupGoalItem } from "@/src/types/goals";

const goal: GroupGoalItem = {
  uuid: "g1",
  id: 1,
  display_name: "Weekend groceries and household",
  mode: "stay_under",
  health: "healthy",
  period: "weekly",
  target_value: "80",
  current_value: "42.5",
  remaining_value: "37.5",
  percent_used: 53,
  period_start: "2026-10-26",
  period_end: "2026-11-01",
  scope: "personal",
  category: {
    uuid: "c1",
    name: "Groceries",
    emoji: "🛒",
    icon: "",
    metric_kind: "amount",
    unit: "usd",
  },
};

describe("GoalHealthPill chart row", () => {
  it("shows the full name, target, and status without clipping to one line", async () => {
    await render(<GoalHealthPill goal={goal} fullWidth />);

    const name = screen.getByText("Weekend groceries and household");
    expect(name).toBeOnTheScreen();
    expect(name.props.numberOfLines).toBeUndefined();
    expect(screen.getByText("Stay under $80.00 per week")).toBeOnTheScreen();
    expect(screen.getByText("$42.50 used · $37.50 left")).toBeOnTheScreen();
    expect(screen.getByText("On track")).toBeOnTheScreen();
  });
});
