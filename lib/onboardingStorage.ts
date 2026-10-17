import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const ONBOARDING_KEY = "onboarding_complete";

function readWebStorage(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ONBOARDING_KEY);
}

function writeWebStorage(value: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ONBOARDING_KEY, value);
}

export async function getOnboardingComplete(): Promise<boolean> {
  if (Platform.OS === "web") {
    return readWebStorage() === "true";
  }

  const value = await SecureStore.getItemAsync(ONBOARDING_KEY);
  return value === "true";
}

export async function setOnboardingComplete(): Promise<void> {
  if (Platform.OS === "web") {
    writeWebStorage("true");
    return;
  }

  await SecureStore.setItemAsync(ONBOARDING_KEY, "true");
}
