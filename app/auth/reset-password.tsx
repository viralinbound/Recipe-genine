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
import { handleAuthUrl } from "@/hooks/useAuth";

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
      if (url) {
        const success = await handleAuthUrl(url);
        if (mounted && success) {
          setSessionEstablished(true);
          setReady(true);
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (mounted) {
        setSessionEstablished(!!data.session);
        setReady(true);
      }
    };

    // Recovery links from email open the app with tokens in the URL.
    Linking.getInitialURL().then(establishSession);
    const linkSub = Linking.addEventListener("url", ({ url }) => {
      establishSession(url);
    });

    // Also catch PASSWORD_RECOVERY auth event from Supabase client.
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setSessionEstablished(true);
        setReady(true);
      }
    });

    return () => {
      mounted = false;
      linkSub.remove();
      authSub.subscription.unsubscribe();
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
      Alert.alert("Password updated", "You can now sign in with your new password.", [
        {
          text: "OK",
          onPress: async () => {
            // Keep the user signed in after reset; land in the app.
            router.replace("/(tabs)");
          },
        },
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
        <ActivityIndicator size="large" color="#E85D3F" />
        <Text style={styles.subtitle}>Opening your reset link…</Text>
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
        <TouchableOpacity style={styles.button} onPress={() => router.replace("/(auth)/forgot-password")}>
          <Text style={styles.buttonText}>Request new link</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace("/(auth)/login")}>
          <Text style={styles.linkText}>Back to login</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.subtitle}>Choose a new password for your Recipe Genie account.</Text>
        <TextInput
          style={styles.input}
          placeholder="New password (min 6 characters)"
          placeholderTextColor="#A9998A"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm new password"
          placeholderTextColor="#A9998A"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          onSubmitEditing={handleSave}
          autoComplete="new-password"
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
  center: {
    flex: 1,
    backgroundColor: "#FFF8F0",
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
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
  button: {
    backgroundColor: "#E85D3F",
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  linkText: { color: "#E85D3F", fontSize: 14, fontWeight: "600", marginTop: 8 },
});
