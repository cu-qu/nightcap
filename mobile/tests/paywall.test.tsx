import { fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";
import { router } from "expo-router";

import { MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID } from "@/src/iap/products";
import { useAuthStore } from "@/src/store/authStore";
import { makeUser } from "./fixtures";
import PaywallScreen from "@/app/paywall";

const mockIap = {
  prices: {
    [MONTHLY_PRODUCT_ID]: { id: MONTHLY_PRODUCT_ID, displayPrice: "$3" },
    [YEARLY_PRODUCT_ID]: { id: YEARLY_PRODUCT_ID, displayPrice: "$15" },
  } as Record<string, { id: string; displayPrice: string }>,
};

jest.mock("@/src/iap/useCoupleIap", () => ({
  useCoupleIap: () => ({
    ready: true,
    supported: true,
    busy: false,
    prices: mockIap.prices,
    subscribe: jest.fn(),
    restore: jest.fn(async () => false),
    redeemCode: jest.fn(),
    manage: jest.fn(),
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockIap.prices = {
    [MONTHLY_PRODUCT_ID]: { id: MONTHLY_PRODUCT_ID, displayPrice: "$3" },
    [YEARLY_PRODUCT_ID]: { id: YEARLY_PRODUCT_ID, displayPrice: "$15" },
  };
  useAuthStore.setState({
    user: makeUser(),
    isAuthenticated: true,
    hydrated: true,
  });
});

describe("paywall", () => {
  it("shows the couple plans, restore, and the free month still running", async () => {
    await render(<PaywallScreen />);

    expect(screen.getByText("NightCap for two")).toBeOnTheScreen();
    expect(screen.getByText("$3 / month")).toBeOnTheScreen();
    expect(screen.getByText("$15 / year")).toBeOnTheScreen();
    expect(screen.getByText(/days left of your 30 days/)).toBeOnTheScreen();
    expect(screen.getByText(/charged to your Apple ID/)).toBeOnTheScreen();
    expect(screen.queryByText(/Google/)).toBeNull();
    expect(screen.getByRole("button", { name: "Restore purchases" })).toBeOnTheScreen();
    expect(screen.getByText("Delete account")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Continue" })).toBeOnTheScreen();
  });

  it("lets a trial member continue into the app", async () => {
    await render(<PaywallScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(router.replace).toHaveBeenCalledWith("/(tabs)");
  });

  it("asks before deleting an account", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await render(<PaywallScreen />);
    await fireEvent.press(screen.getByText("Delete account"));
    expect(alert).toHaveBeenCalledWith(
      "Delete account?",
      expect.stringContaining("does not cancel"),
      expect.any(Array)
    );
  });

  it("hides Continue after the trial is over", async () => {
    useAuthStore.setState({
      user: makeUser({
        membership: {
          status: "expired",
          is_active: false,
          plan: null,
          source: "none",
          trial_ends_at: new Date(Date.now() - 86400000).toISOString(),
          expires_at: new Date(Date.now() - 86400000).toISOString(),
          auto_renewing: false,
          covers_couple: false,
          product_id: null,
        },
      }),
    });
    await render(<PaywallScreen />);

    expect(screen.getByText("Subscribe to keep NightCap for two.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(screen.getByText("Delete account")).toBeOnTheScreen();
  });

  it("hides plan prices until the store returns them", async () => {
    mockIap.prices = {};
    await render(<PaywallScreen />);

    expect(screen.queryByText("$3 / month")).toBeNull();
    expect(screen.queryByText("$15 / year")).toBeNull();
    expect(screen.getByText(/Prices appear when the App Store responds/)).toBeOnTheScreen();
  });
});
