import { apiRequest } from "@/src/api/client";
import type { RegisterResponse, TokenResponse, User } from "@/src/types/api";

export async function register(input: {
  username: string;
  email: string;
  password: string;
  invite_code?: string;
}): Promise<RegisterResponse> {
  return apiRequest<RegisterResponse>("/api/v1/auth/register/", {
    method: "POST",
    body: input,
    auth: false,
  });
}

export async function login(input: {
  username: string;
  password: string;
}): Promise<TokenResponse> {
  return apiRequest<TokenResponse>("/api/v1/auth/token/", {
    method: "POST",
    body: input,
    auth: false,
  });
}

export async function fetchMe(): Promise<User> {
  return apiRequest<User>("/api/v1/auth/me/");
}

export async function deleteAccount(): Promise<void> {
  await apiRequest<unknown>("/api/v1/auth/account/", {
    method: "DELETE",
  });
}
