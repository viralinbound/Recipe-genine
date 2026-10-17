import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Linking from "expo-linking";

/**
 * Supabase → Authentication → URL Configuration
 *
 * Site URL:
 *   recipegenie://auth/callback
 *
 * Redirect URLs (store + Expo Go):
 *   recipegenie://auth/callback
 *   recipegenie://auth/reset-password
 *   recipegenie://**
 *   exp://**
 *   https://icvqgxqtqsigbabucbgt.supabase.co/auth/v1/callback
 *   https://icvqgxqtqsigbabucbgt.supabase.co/**
 */
export const APP_SCHEME = "recipegenie";

export const AUTH_CALLBACK_PATH = "auth/callback";
export const AUTH_RESET_PASSWORD_PATH = "auth/reset-password";

export const PRODUCTION_AUTH_CALLBACK_URL = `${APP_SCHEME}://${AUTH_CALLBACK_PATH}`;
export const PRODUCTION_RESET_PASSWORD_URL = `${APP_SCHEME}://${AUTH_RESET_PASSWORD_PATH}`;

export function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

/**
 * Redirect for OAuth / email confirm / password reset.
 * Expo Go cannot open recipegenie:// — must use exp://HOST:8081/--/auth/...
 * Store / dev-client builds use recipegenie://...
 */
export function getAuthRedirectUrl(path: "auth/callback" | "auth/reset-password"): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.origin}/${path}`;
  }

  if (isExpoGo()) {
    // e.g. exp://10.20.57.42:8081/--/auth/callback
    return Linking.createURL(path);
  }

  return path === "auth/reset-password"
    ? PRODUCTION_RESET_PASSWORD_URL
    : PRODUCTION_AUTH_CALLBACK_URL;
}

export function isPasswordRecoveryUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const u = url.replace(/#/g, "?").toLowerCase();
  return (
    u.includes("type=recovery") ||
    u.includes("type%3drecovery") ||
    u.includes("auth/reset-password") ||
    u.includes("reset-password")
  );
}

export const SUPABASE_REDIRECT_ALLOWLIST = [
  PRODUCTION_AUTH_CALLBACK_URL,
  PRODUCTION_RESET_PASSWORD_URL,
  `${APP_SCHEME}://**`,
  "exp://**",
  "https://icvqgxqtqsigbabucbgt.supabase.co/auth/v1/callback",
  "https://icvqgxqtqsigbabucbgt.supabase.co/**",
];
