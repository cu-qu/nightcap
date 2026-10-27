import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { setupOnboarding } from "@/src/api/onboarding";
import * as authApi from "@/src/api/auth";
import { useAuthStore } from "@/src/store/authStore";
import { makeUser } from "./fixtures";
import OnboardingScreen from "@/app/(onboarding)/index";

jest.mock("@/src/api/auth", () => ({
  login: jest.fn(),
  register: jest.fn(),
  fetchMe: jest.fn(),
  deleteAccount: jest.fn(),
}));

jest.mock("@/src/api/tokens", () => ({
  getAccessToken: jest.fn(async () => "access"),
  getRefreshToken: jest.fn(async () => "refresh"),
  setTokens: jest.fn(async () => undefined),
  clearTokens: jest.fn(async () => undefined),
}));

const fetchMe = authApi.fetchMe as jest.Mock;
const completeSetup = setupOnboarding as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  fetchMe.mockResolvedValue(makeUser({ onboarding_completed: true }));
  useAuthStore.setState({
    user: makeUser({ onboarding_completed: false }),
    isAuthenticated: true,
    hydrated: true,
  });
});

async function skipGroup() {
  await fireEvent.press(await screen.findByText("None of these"));
}

describe("solo onboarding", () => {
  it("walks from who this is for through the nightly reminder without picking goals", async () => {
    await render(<OnboardingScreen />);

    expect(await screen.findByText("Who’s this for?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByText("Just me"));
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Spending limits")).toBeOnTheScreen();
    await skipGroup();
    expect(await screen.findByText("Movement")).toBeOnTheScreen();
    await skipGroup();
    expect(await screen.findByText("Other habits")).toBeOnTheScreen();
    await skipGroup();

    expect(await screen.findByText("Nightly reminder")).toBeOnTheScreen();
    await fireEvent.press(screen.getByText("Not now"));

    await waitFor(() => {
      expect(completeSetup).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "solo",
          templates: [],
        })
      );
    });
  });
});
