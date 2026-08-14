import { useEffect, useState, useCallback } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SecureStore from "expo-secure-store";
import * as SplashScreen from "expo-splash-screen";
import { View, ActivityIndicator } from "react-native";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/stores/authStore";
import ErrorBoundary from "@/components/ErrorBoundary";

SplashScreen.preventAutoHideAsync().catch(() => {});

function useProtectedRoute() {
  const { isAuthenticated, initializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { onboardingComplete, setOnboardingComplete } = useAuthStore();
  const onboardingChecked = onboardingComplete !== null;
  const onboardingDone = onboardingComplete === true;

  useEffect(() => {
    SecureStore.getItemAsync("onboarding_complete")
      .then((val) => {
        console.log("[DBG] SecureStore onboarding_complete=", val);
        setOnboardingComplete(val === "true");
      })
      .catch((e) => {
        console.log("[DBG] SecureStore error", String(e));
        setOnboardingComplete(false);
      });
  }, []);

  console.log("[DBG] state", { initializing, onboardingComplete });

  useEffect(() => {
    if (initializing || !onboardingChecked) return;

    const inAuthGroup = segments[0] === "(auth)";
    const onOnboarding = segments[0] === "onboarding";
    // The password-recovery deep link (recipegenie://auth/reset-password)
    // lands here with no session yet — it establishes one itself from the
    // link's tokens, so it must be reachable without being signed in first.
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

    SplashScreen.hideAsync().catch(() => {});
  }, [isAuthenticated, initializing, segments, onboardingChecked, onboardingDone]);

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
