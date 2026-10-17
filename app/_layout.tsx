import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import { View, ActivityIndicator, Alert, Platform, LogBox } from "react-native";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/stores/authStore";
import ErrorBoundary from "@/components/ErrorBoundary";
import { getOnboardingComplete } from "@/lib/onboardingStorage";
import { ensureNotificationPermission } from "@/lib/notifications";
import { getNotificationPrompted, setNotificationPrompted } from "@/lib/notificationPromptStorage";

LogBox.ignoreLogs(["Cannot connect to Expo CLI"]);

SplashScreen.preventAutoHideAsync().catch(() => {});

function useProtectedRoute() {
  const { isAuthenticated, initializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { onboardingComplete, setOnboardingComplete } = useAuthStore();
  const onboardingChecked = onboardingComplete !== null;
  const onboardingDone = onboardingComplete === true;
  const [notificationPrompted, setNotificationPromptedState] = useState<boolean | null>(null);

  useEffect(() => {
    getOnboardingComplete()
      .then((complete) => {
        setOnboardingComplete(complete);
      })
      .catch((e) => {
        console.log("[DBG] onboarding storage error", String(e));
        setOnboardingComplete(false);
      });
  }, []);

  useEffect(() => {
    getNotificationPrompted()
      .then((prompted) => {
        setNotificationPromptedState(prompted);
      })
      .catch(() => {
        setNotificationPromptedState(false);
      });
  }, []);

  useEffect(() => {
    if (initializing || !onboardingChecked) return;

    const inAuthGroup = segments[0] === "(auth)";
    const onOnboarding = segments[0] === "onboarding";
    const onPasswordReset = segments[0] === "auth";

    if (!onboardingDone && !onOnboarding && !onPasswordReset) {
      router.replace("/onboarding");
      return;
    }

    if (onboardingDone && !isAuthenticated && !inAuthGroup && !onPasswordReset) {
      router.replace("/(auth)/login");
      return;
    }

    if (isAuthenticated && (inAuthGroup || onOnboarding)) {
      router.replace("/(tabs)");
      return;
    }

    setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 4000);
  }, [isAuthenticated, initializing, segments, onboardingChecked, onboardingDone]);

  // First install / first login: explain then ask for notification permission
  useEffect(() => {
    if (initializing || !onboardingChecked) return;
    if (notificationPrompted === null) return;
    if (!onboardingDone || !isAuthenticated || notificationPrompted) return;
    if (Platform.OS === "web") {
      setNotificationPromptedState(true);
      setNotificationPrompted().catch(() => {});
      return;
    }

    Alert.alert(
      "Allow meal reminders?",
      "Recipe Genie can notify you when it's time to start cooking so your meals are ready on time.",
      [
        {
          text: "Not now",
          style: "cancel",
          onPress: async () => {
            await setNotificationPrompted().catch(() => {});
            setNotificationPromptedState(true);
          },
        },
        {
          text: "Allow",
          onPress: async () => {
            await ensureNotificationPermission().catch(() => {});
            await setNotificationPrompted().catch(() => {});
            setNotificationPromptedState(true);
          },
        },
      ],
      { cancelable: false }
    );
  }, [initializing, onboardingChecked, onboardingDone, isAuthenticated, notificationPrompted]);

  return { ready: !initializing && onboardingChecked };
}

function RootNavigator() {
  const { ready } = useProtectedRoute();
  console.log("[DBG] RootNavigator ready=", ready);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      <Stack.Screen name="auth/reset-password" options={{ headerShown: true, title: "" }} />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="recipe/[id]" options={{ headerShown: true, title: "" }} />
      <Stack.Screen name="schedule/[id]" options={{ headerShown: true, title: "Schedule Meal" }} />
      <Stack.Screen name="collection/[id]" options={{ headerShown: true, title: "" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <RootNavigator />
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
