import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import { ApiError } from "@/src/api/client";
import * as authApi from "@/src/api/auth";
import { useAuthStore } from "@/src/store/authStore";
import { needsEmailVerification } from "@/src/utils/needsEmailVerification";
import { makeUser } from "./fixtures";
import VerifyEmailScreen from "@/app/verify-email";

jest.mock("@/src/api/auth", () => ({
  login: jest.fn(),
  register: jest.fn(),
  fetchMe: jest.fn(),
  deleteAccount: jest.fn(),
  requestPasswordReset: jest.fn(),
  resendVerificationEmail: jest.fn(),
}));

jest.mock("@/src/api/tokens", () => ({
  getAccessToken: jest.fn(async () => "access"),
  getRefreshToken: jest.fn(async () => "refresh"),
  setTokens: jest.fn(async () => undefined),
  clearTokens: jest.fn(async () => undefined),
}));

const resendVerificationEmail = authApi.resendVerificationEmail as jest.Mock;
const fetchMe = authApi.fetchMe as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  const user = makeUser({ email_verified: false, onboarding_completed: false });
  fetchMe.mockResolvedValue(user);
  useAuthStore.setState({ user, isAuthenticated: true, hydrated: true });
});

describe("needsEmailVerification", () => {
  it("is true only when the account is explicitly unverified", () => {
    expect(needsEmailVerification(makeUser({ email_verified: false }))).toBe(true);
    expect(needsEmailVerification(makeUser({ email_verified: true }))).toBe(false);
    expect(needsEmailVerification(null)).toBe(false);
  });
});

describe("confirm email screen", () => {
  it("shows the address and resends the confirmation", async () => {
    resendVerificationEmail.mockResolvedValue(undefined);
    await render(<VerifyEmailScreen />);

    expect(screen.getByText(/ux1022f@example.com/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Resend email" }));

    expect(resendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/A new link is on its way/)).toBeOnTheScreen();
  });

  it("shows the provider error when resend fails", async () => {
    resendVerificationEmail.mockRejectedValue(
      new ApiError(503, "We could not send the confirmation email. Try again in a moment.")
    );
    await render(<VerifyEmailScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Resend email" }));

    expect(
      await screen.findByText("We could not send the confirmation email. Try again in a moment.")
    ).toBeOnTheScreen();
  });

  it("leaves the screen once the account is confirmed", async () => {
    fetchMe.mockResolvedValue(makeUser({ email_verified: true, onboarding_completed: false }));
    await render(<VerifyEmailScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "I've confirmed" }));

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/(onboarding)");
    });
  });
});
