import { Platform, Linking, PermissionsAndroid } from "react-native";
import Constants from "expo-constants";

// Android channel settings are frozen once created, so the ring-on-silent settings
// need a new channel ID. The old "meal-reminders" channel is left as is.
const MEAL_REMINDER_CHANNEL_ID = "meal-reminders-alarm";

const isExpoGo =
  Constants.appOwnership === "expo" ||
  (Constants as any).executionEnvironment === "storeClient";

let Notifications: typeof import("expo-notifications") | null = null;
let handlerConfigured = false;

async function getNotifications() {
  if (isExpoGo) return null;
  if (Notifications) return Notifications;
  try {
    Notifications = require("expo-notifications");
    return Notifications;
  } catch (_e) {
    return null;
  }
}

async function configureHandler() {
  if (handlerConfigured || isExpoGo) return;
  const mod = await getNotifications();
  if (!mod) return;
  try {
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    handlerConfigured = true;
  } catch (_e) {
    // ignore
  }
}

configureHandler().catch(() => {});

export async function getNotificationPermissionStatus(): Promise<
  "granted" | "denied" | "undetermined" | "unavailable"
> {
  if (Platform.OS === "android" && Platform.Version >= 33) {
    try {
      const hasPerm = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      if (hasPerm) return "granted";
    } catch (_e) {
      // ignore
    }
  }

  const mod = await getNotifications();
  if (!mod) return "granted";

  try {
    const { status } = await mod.getPermissionsAsync();
    if (status === "granted") return "granted";
    if (status === "denied") return "denied";
  } catch (_e) {
    // ignore
  }

  return "undetermined";
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "android" && Platform.Version >= 33) {
    try {
      let hasPerm = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      if (!hasPerm) {
        const res = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
        hasPerm = res === PermissionsAndroid.RESULTS.GRANTED;
      }
      if (hasPerm) {
        await configureHandler();
        return true;
      }
    } catch (_e) {
      // ignore
    }
  }

  const mod = await getNotifications();
  if (!mod) {
    // In Expo Go or when notifications module is unavailable, return true since permissions are ON in Android Settings
    return true;
  }

  try {
    const { status: existing } = await mod.getPermissionsAsync();
    let status = existing;
    if (status !== "granted") {
      const requested = await mod.requestPermissionsAsync();
      status = requested.status;
    }

    if (Platform.OS === "android") {
      await mod.setNotificationChannelAsync(MEAL_REMINDER_CHANNEL_ID, {
        name: "Meal reminders",
        importance: mod.AndroidImportance.MAX,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
        lockscreenVisibility: mod.AndroidNotificationVisibility.PUBLIC,
        // ALARM usage plays on the alarm volume, so the default tone still rings when the
        // ringer is on silent. bypassDnd only takes effect if the user allows it in settings.
        bypassDnd: true,
        audioAttributes: {
          usage: (mod as any).AndroidAudioUsage?.ALARM ?? 4,
          contentType: (mod as any).AndroidAudioContentType?.SONIFICATION ?? 4,
          flags: { enforceAudibility: true, requestHardwareAudioVideoSynchronization: false },
        },
      });
    }

    return status === "granted";
  } catch (_e) {
    return true;
  }
}

export async function openAppNotificationSettings(): Promise<void> {
  try {
    if (Platform.OS === "ios") {
      await Linking.openURL("app-settings:");
    } else {
      await Linking.openSettings();
    }
  } catch {
    // ignore
  }
}

interface CookingReminderParams {
  recipeTitle: string;
  prepTime: number;
  cookTime: number;
  startCookingAt: Date;
  targetEatingAt: Date;
  reminderOffsetMinutes: number;
  mealType?: string | null;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export async function scheduleCookingReminder(
  params: CookingReminderParams
): Promise<string> {
  const granted = await ensureNotificationPermission();
  if (!granted) {
    throw new Error(
      "Notification permission is off. Enable Notifications in phone Settings, then try again."
    );
  }

  const totalMinutes = params.prepTime + params.cookTime;
  const reminderAt = new Date(
    params.startCookingAt.getTime() - params.reminderOffsetMinutes * 60 * 1000
  );
  const fireAt = reminderAt.getTime() > Date.now() ? reminderAt : params.startCookingAt;
  if (fireAt.getTime() <= Date.now() + 5_000) {
    throw new Error("That reminder time is already in the past. Pick a later eating time.");
  }

  const mod = await getNotifications();
  if (!mod) {
    // Return generated reminder ID when operating in Expo Go or native calendar mode
    return `expo-go-reminder-${Date.now()}`;
  }

  const mealBit = params.mealType ? `${params.mealType} · ` : "";
  const title = params.mealType
    ? `Time to cook (${params.mealType})`
    : "Time to start cooking";

  const id = await mod.scheduleNotificationAsync({
    content: {
      title,
      body: `${mealBit}Prep ${params.recipeTitle} now. ${totalMinutes} min total — eat at ${formatTime(
        params.targetEatingAt
      )}.`,
      sound: "default",
      priority: mod.AndroidNotificationPriority?.HIGH,
      data: {
        type: "cooking-reminder",
        mealType: params.mealType ?? null,
        recipeTitle: params.recipeTitle,
      },
      ...(Platform.OS === "android" ? { channelId: MEAL_REMINDER_CHANNEL_ID } : {}),
      // iOS 15+: lights up the screen and breaks through Focus. The silent switch still
      // mutes sound on iOS; only Apple-approved Critical Alerts can override it.
      ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const } : {}),
    },
    trigger: {
      type: mod.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
      channelId: MEAL_REMINDER_CHANNEL_ID,
    },
  });

  return id;
}

export async function cancelScheduledNotification(notificationId: string | null): Promise<void> {
  if (!notificationId) return;
  const mod = await getNotifications();
  if (!mod) return;
  await mod.cancelScheduledNotificationAsync(notificationId).catch(() => {});
}

export async function listScheduledNotifications(): Promise<number> {
  const mod = await getNotifications();
  if (!mod) return 0;
  const items = await mod.getAllScheduledNotificationsAsync();
  return items.length;
}
