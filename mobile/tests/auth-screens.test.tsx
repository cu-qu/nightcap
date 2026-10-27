import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import { ApiError } from "@/src/api/client";
import * as authApi from "@/src/api/auth";
import { useAuthStore } from "@/src/store/authStore";
import { makeUser } from "./fixtures";
import ForgotPasswordScreen from "@/app/(auth)/forgot-password";
import LoginScreen from "@/app/(auth)/login";
import RegisterScreen from "@/app/(auth)/register";

jest.mock("@/src/api/auth", () => ({
  login: jest.fn(),
  register: jest.fn(),
  fetchMe: jest.fn(),
  deleteAccount: jest.fn(),
  requestPasswordReset: jest.fn(),
}));

jest.mock("@/src/api/tokens", () => ({
  getAccessToken: jest.fn(async () => null),
  getRefreshToken: jest.fn(async () => null),
  setTokens: jest.fn(async () => undefined),
  clearTokens: jest.fn(async () => undefined),
}));

const login = authApi.login as jest.Mock;
const register = authApi.register as jest.Mock;
const requestPasswordReset = authApi.requestPasswordReset as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: null, isAuthenticated: false, hydrated: true });
});

describe("sign in", () => {
  it("keeps Sign in disabled until both fields are filled", async () => {
    await render(<LoginScreen />);

    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    await fireEvent.changeText(screen.getByPlaceholderText("yourname"), "ux1022f");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    await fireEvent.changeText(screen.getByPlaceholderText("••••••••"), "nightcap-test-1");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("shows the API error when the password is wrong", async () => {
    login.mockRejectedValue(new ApiError(401, "No active account found"));
    await render(<LoginScreen />);

    await fireEvent.changeText(screen.getByPlaceholderText("yourname"), "ux1022f");
    await fireEvent.changeText(screen.getByPlaceholderText("••••••••"), "wrong-pass");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("No active account found")).toBeOnTheScreen();
  });

  it("opens forgot password with the username already typed", async () => {
    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText("yourname"), "ux1022f");
    await fireEvent.press(screen.getByText("Forgot password?"));

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/(auth)/forgot-password",
      params: { username: "ux1022f" },
    });
  });
});

describe("forgot password", () => {
  it("asks the API to email a reset link", async () => {
    requestPasswordReset.mockResolvedValue(undefined);
    await render(<ForgotPasswordScreen />);

    await fireEvent.changeText(
      screen.getByPlaceholderText("you@example.com"),
      "ux1022f@example.com"
    );
    await fireEvent.press(screen.getByRole("button", { name: "Send reset link" }));

    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: "ux1022f@example.com",
    });
    expect(
      await screen.findByText(
        "If that account exists, a reset link is on its way from nightcap@cuqulabs.com."
      )
    ).toBeOnTheScreen();
  });
});

describe("create account", () => {
  it("requires a username, email, and 8 character password", async () => {
    await render(<RegisterScreen />);
    const submit = screen.getByRole("button", { name: "Create account" });

    expect(submit).toBeDisabled();
    await fireEvent.changeText(screen.getByPlaceholderText("yourname"), "ux1022f");
    await fireEvent.changeText(screen.getByPlaceholderText("you@example.com"), "ux1022f@example.com");
    await fireEvent.changeText(screen.getByPlaceholderText("At least 8 characters"), "short");
    expect(submit).toBeDisabled();
    await fireEvent.changeText(screen.getByPlaceholderText("At least 8 characters"), "nightcap-test-1");
    expect(submit).toBeEnabled();
  });

  it("registers with trimmed fields", async () => {
    register.mockResolvedValue({
      access: "access",
      refresh: "refresh",
      user: makeUser(),
    });
    await render(<RegisterScreen />);

    await fireEvent.changeText(screen.getByPlaceholderText("yourname"), "  ux1022f  ");
    await fireEvent.changeText(screen.getByPlaceholderText("you@example.com"), " ux1022f@example.com ");
    await fireEvent.changeText(screen.getByPlaceholderText("At least 8 characters"), "nightcap-test-1");
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith({
        username: "ux1022f",
        email: "ux1022f@example.com",
        password: "nightcap-test-1",
      });
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it("shows the server message when registration fails", async () => {
    register.mockRejectedValue(new ApiError(400, "A user with that username already exists."));
    await render(<RegisterScreen />);

    await fireEvent.changeText(screen.getByPlaceholderText("yourname"), "ux1022f");
    await fireEvent.changeText(screen.getByPlaceholderText("you@example.com"), "ux1022f@example.com");
    await fireEvent.changeText(screen.getByPlaceholderText("At least 8 characters"), "nightcap-test-1");
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText("A user with that username already exists.")
    ).toBeOnTheScreen();
  });
});
