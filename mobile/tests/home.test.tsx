import { render, screen, waitFor } from "@testing-library/react-native";

import { fetchCalendar } from "@/src/api/calendar";
import { useAuthStore } from "@/src/store/authStore";
import { todayIso } from "@/src/utils/date";
import { makeUser } from "./fixtures";
import HomeScreen from "@/app/(tabs)/index";

const calendar = fetchCalendar as jest.Mock;

beforeEach(() => {
  calendar.mockReset();
  calendar.mockResolvedValue({ days: [] });
  useAuthStore.setState({
    user: makeUser(),
    isAuthenticated: true,
    hydrated: true,
  });
});

describe("tonight", () => {
  it("offers Start NightCap when today is still open", async () => {
    await render(<HomeScreen />);
    expect(await screen.findByRole("button", { name: "Start NightCap" })).toBeOnTheScreen();
    expect(screen.getByText("Or pick another day on Calendar")).toBeOnTheScreen();
  });

  it("switches to Edit NightCap after a day is logged", async () => {
    const today = todayIso();
    calendar.mockResolvedValue({
      days: [{ date: today, has_nightcap: true }],
    });
    await render(<HomeScreen />);
    expect(await screen.findByRole("button", { name: "Edit NightCap" })).toBeOnTheScreen();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Start NightCap" })).toBeNull();
    });
  });
});
