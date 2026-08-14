import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const MEAL_REMINDER_CHANNEL_ID = "meal-reminders";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(MEAL_REMINDER_CHANNEL_ID, {
      name: "Meal reminders",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  return status === "granted";
}

interface CookingReminderParams {
  recipeTitle: string;
  prepTime: number;
  cookTime: number;
  startCookingAt: Date;
  targetEatingAt: Date;
  reminderOffsetMinutes: number;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Schedules a single exact local notification `reminderOffsetMinutes` before
// the cooking start time (falling back to the start time itself if that
// would land in the past). Returns the OS notification id, or null if
// permission was denied or there's no future time left to schedule against.
export async function scheduleCookingReminder(
  params: CookingReminderParams
): Promise<string | null> {
  const granted = await ensureNotificationPermission();
  if (!granted) return null;

  const totalMinutes = params.prepTime + params.cookTime;
  const reminderAt = new Date(
    params.startCookingAt.getTime() - params.reminderOffsetMinutes * 60 * 1000
  );
  const fireAt = reminderAt.getTime() > Date.now() ? reminderAt : params.startCookingAt;
  if (fireAt.getTime() <= Date.now()) return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Time to start cooking",
      body: `Prep time for ${params.recipeTitle}! Total duration needed: ${totalMinutes} mins. Start now to eat on time at ${formatTime(
        params.targetEatingAt
      )}.`,
      sound: "default",
      data: { type: "cooking-reminder" },
    },
    trigger: {
      date: fireAt,
      channelId: MEAL_REMINDER_CHANNEL_ID,
    },
  });
}

export async function cancelScheduledNotification(notificationId: string | null): Promise<void> {
  if (!notificationId) return;
  await Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => {});
}
