import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

import { registerDevicePushToken } from "@/src/api/partnership";
import {
  hasNotificationPermission,
  requestNotificationPermission,
} from "@/src/notifications/reminders";

const APNS_TOKEN = /^[0-9a-fA-F]{64,200}$/;

export async function registerPushTokenIfPossible(options?: {
  prompt?: boolean;
}): Promise<boolean> {
  if (Platform.OS !== "ios") return false;

  const allowed = options?.prompt
    ? await requestNotificationPermission()
    : await hasNotificationPermission();
  if (!allowed) return false;

  try {
    const tokenResponse = await Notifications.getDevicePushTokenAsync();
    const token = String(tokenResponse.data ?? "").replace(/[<>\s]/g, "");
    if (!APNS_TOKEN.test(token)) return false;
    await registerDevicePushToken({
      token,
      platform: "ios",
      environment: __DEV__ ? "sandbox" : "production",
    });
    return true;
  } catch {
    return false;
  }
}
