import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

import { registerDevicePushToken } from "@/src/api/partnership";
import {
  hasNotificationPermission,
  requestNotificationPermission,
} from "@/src/notifications/reminders";

function expoProjectId(): string | undefined {
  const fromEas = Constants.easConfig?.projectId;
  const fromExtra = Constants.expoConfig?.extra?.eas?.projectId;
  const id = (fromEas || fromExtra || "").trim();
  return id || undefined;
}

export async function registerPushTokenIfPossible(options?: {
  prompt?: boolean;
}): Promise<boolean> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return false;

  const allowed = options?.prompt
    ? await requestNotificationPermission()
    : await hasNotificationPermission();
  if (!allowed) return false;

  try {
    const projectId = expoProjectId();
    const tokenResponse = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token = tokenResponse.data;
    if (!token) return false;
    await registerDevicePushToken({
      token,
      platform: Platform.OS,
    });
    return true;
  } catch {
    return false;
  }
}
