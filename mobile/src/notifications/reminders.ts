import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

export const REMINDER_ID = "nightcap-daily-reminder";
export const REMINDER_CHANNEL_ID = "nightcap-reminders";
export const REMINDER_PATH = "/ritual/spend" as const;
export const DEFAULT_REMINDER_HOUR = 21;
export const DEFAULT_REMINDER_MINUTE = 0;

const nativeNotifications = Platform.OS === "ios" || Platform.OS === "android";

if (nativeNotifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export function remindersSupported(): boolean {
  return nativeNotifications;
}

export function formatReminderTime(hour: number, minute: number): string {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function dateFromReminderTime(hour: number, minute: number): Date {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: "Nightly reminder",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 150, 200],
    lightColor: "#8B5CF6",
  });
}

export async function hasReminderPermission(): Promise<boolean> {
  if (!nativeNotifications) return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (
      Platform.OS === "ios" &&
      current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    ) {
      return true;
    }
    return current.status === "granted";
  } catch {
    return false;
  }
}

export async function requestReminderPermission(): Promise<boolean> {
  if (!nativeNotifications) return false;
  try {
    await ensureAndroidChannel();
    if (await hasReminderPermission()) return true;
    const requested = await Notifications.requestPermissionsAsync();
    if (requested.granted) return true;
    if (
      Platform.OS === "ios" &&
      requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    ) {
      return true;
    }
    return requested.status === "granted";
  } catch {
    return false;
  }
}

export async function cancelNightlyReminder(): Promise<void> {
  if (!nativeNotifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
  } catch {
    // nothing scheduled yet
  }
}

export async function scheduleNightlyReminder(
  hour: number,
  minute: number
): Promise<boolean> {
  if (!nativeNotifications) return false;
  const allowed = await requestReminderPermission();
  if (!allowed) return false;

  await cancelNightlyReminder();
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: "Time for your NightCap 🌙",
      body: "Close out the day — spend, habits, and a good note.",
      data: { url: REMINDER_PATH },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: REMINDER_CHANNEL_ID,
    },
  });
  return true;
}
