import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";

// The recovery link Supabase emails looks like:
//   recipegenie://auth/reset-password#access_token=...&refresh_token=...&type=recovery
// Tokens live in the URL fragment (never sent to a server), so we parse the
// opening URL ourselves and establish the session before letting the user
// set a new password. lib/supabase.ts has detectSessionInUrl: false since
// that option only applies to web, so this manual step is required on native.
function parseTokensFromUrl(url: string): { access_token: string; refresh_token: string } | null {
  try {
    const raw = url.includes("#") ? url.split("#")[1] : url.split("?")[1];
    if (!raw) return null;
    const params = new URLSearchParams(raw);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (access_token && refresh_token) return { access_token, refresh_token };
    return null;
  } catch {
    return null;
  }
}

export default function ResetPassword() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sessionEstablished, setSessionEstablished] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const establishSession = async (url: string | null) => {
      const tokens = url ? parseTokensFromUrl(url) : null;
      if (tokens) {
        const { error } = await supabase.auth.setSession(tokens);
        if (mounted) setSessionEstablished(!error);
      }
      if (mounted) setReady(true);
    };

    Linking.getInitialURL().then(establishSession);
    const sub = Linking.addEventListener("url", ({ url }) => establishSession(url));
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const handleSave = async () => {
    if (password.length < 6) {
      Alert.alert("Weak password", "Use at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Passwords don't match", "Make sure both fields match.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      Alert.alert("Password updated", "You're all set.", [
        { text: "OK", onPress: () => router.replace("/(tabs)") },
      ]);
    } catch (e: any) {
      Alert.alert("Couldn't update password", e.message ?? "Try the reset link again.");
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (!sessionEstablished) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.title}>This reset link isn't valid</Text>
        <Text style={styles.subtitle}>
          It may have expired or already been used. Request a new one from the login screen.
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace("/(auth)/login")}>
          <Text style={styles.buttonText}>Back to login</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.subtitle}>Choose a new password for your account.</Text>
        <TextInput
          style={styles.input}
          placeholder="New password"
          placeholderTextColor="#A9998A"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm new password"
          placeholderTextColor="#A9998A"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          onSubmitEditing={handleSave}
        />
        <TouchableOpacity
          style={[styles.button, loading && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? "Saving..." : "Save new password"}</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8F0", padding: 24, paddingTop: 60 },
  center: { flex: 1, backgroundColor: "#FFF8F0", padding: 24, alignItems: "center", justifyContent: "center", gap: 16 },
  title: { fontSize: 24, fontWeight: "800", color: "#2B2118", marginBottom: 8, textAlign: "center" },
  subtitle: { fontSize: 15, color: "#8A7A6C", marginBottom: 24, textAlign: "center" },
  input: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#EFE2D6",
    color: "#2B2118",
    marginBottom: 16,
  },
  button: { backgroundColor: "#E85D3F", borderRadius: 14, paddingVertical: 15, paddingHorizontal: 24, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
