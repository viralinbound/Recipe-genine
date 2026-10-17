import AsyncStorage from "@react-native-async-storage/async-storage";

const NOTIFICATION_PROMPTED_KEY = "notification_permission_prompted";

export async function getNotificationPrompted(): Promise<boolean> {
  const value = await AsyncStorage.getItem(NOTIFICATION_PROMPTED_KEY);
  return value === "true";
}

export async function setNotificationPrompted(): Promise<void> {
  await AsyncStorage.setItem(NOTIFICATION_PROMPTED_KEY, "true");
}
