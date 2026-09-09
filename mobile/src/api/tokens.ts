import * as SecureStore from "expo-secure-store";

const ACCESS_KEY = "nightcap_access";
const REFRESH_KEY = "nightcap_refresh";

const memory = new Map<string, string>();

function webStorage(): Storage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    return null;
  }
  return null;
}

async function canUseSecureStore(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

async function getItem(key: string): Promise<string | null> {
  if (await canUseSecureStore()) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      // Native module present but methods missing (web / Expo Go mismatch).
    }
  }
  return webStorage()?.getItem(key) ?? memory.get(key) ?? null;
}

async function setItem(key: string, value: string): Promise<void> {
  if (await canUseSecureStore()) {
    try {
      await SecureStore.setItemAsync(key, value);
      return;
    } catch {
      // Fall through to web / memory storage.
    }
  }
  const storage = webStorage();
  if (storage) storage.setItem(key, value);
  else memory.set(key, value);
}

async function removeItem(key: string): Promise<void> {
  if (await canUseSecureStore()) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Fall through so logout / hydrate can finish.
    }
  }
  webStorage()?.removeItem(key);
  memory.delete(key);
}

export async function getAccessToken(): Promise<string | null> {
  return getItem(ACCESS_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return getItem(REFRESH_KEY);
}

export async function setTokens(access: string, refresh: string): Promise<void> {
  await setItem(ACCESS_KEY, access);
  await setItem(REFRESH_KEY, refresh);
}

export async function clearTokens(): Promise<void> {
  await removeItem(ACCESS_KEY);
  await removeItem(REFRESH_KEY);
}
