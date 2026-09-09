import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "@/src/api/tokens";

const DEFAULT_BASE = "http://localhost:8000";

export function getApiBaseUrl(): string {
  return (process.env.EXPO_PUBLIC_API_URL || DEFAULT_BASE).replace(/\/$/, "");
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  headers?: Record<string, string>;
};

let onUnauthorized: (() => void) | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refresh = await getRefreshToken();
    if (!refresh) return false;

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/auth/token/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ refresh }),
      });
      if (!res.ok) {
        await clearTokens();
        return false;
      }
      const data = (await res.json()) as { access: string; refresh?: string };
      const nextRefresh = data.refresh ?? refresh;
      await setTokens(data.access, nextRefresh);
      return true;
    } catch {
      await clearTokens();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const record = body as Record<string, unknown>;
  if (typeof record.detail === "string") return record.detail;
  const first = Object.values(record)[0];
  if (Array.isArray(first) && typeof first[0] === "string") return first[0];
  if (typeof first === "string") return first;
  return fallback;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, auth = true, headers = {} } = options;
  const url = path.startsWith("http") ? path : `${getApiBaseUrl()}${path}`;

  const buildHeaders = async (): Promise<Record<string, string>> => {
    const next: Record<string, string> = {
      Accept: "application/json",
      ...headers,
    };
    if (body !== undefined) next["Content-Type"] = "application/json";
    if (auth) {
      const access = await getAccessToken();
      if (access) next.Authorization = `Bearer ${access}`;
    }
    return next;
  };

  const doFetch = async () =>
    fetch(url, {
      method,
      headers: await buildHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  let res = await doFetch();

  if (res.status === 401 && auth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch();
    } else {
      onUnauthorized?.();
      const parsed = await parseBody(res);
      throw new ApiError(401, "Session expired. Please sign in again.", parsed);
    }
  }

  const parsed = await parseBody(res);
  if (!res.ok) {
    if (res.status === 401 && auth) onUnauthorized?.();
    throw new ApiError(
      res.status,
      errorMessage(parsed, `Request failed (${res.status})`),
      parsed
    );
  }

  return parsed as T;
}
