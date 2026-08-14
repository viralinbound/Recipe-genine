import { useState } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/hooks/useAuth";

export default function Signup() {
  const { signUpWithEmail } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!name || !email || !password) {
      Alert.alert("Missing info", "Fill in all fields.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Weak password", "Use at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      await signUpWithEmail(email.trim(), password, name.trim());
      Alert.alert(
        "Check your email",
        "Confirm your address to finish signing up, then log in.",
        [{ text: "OK", onPress: () => router.replace("/(auth)/login") }]
      );
    } catch (e: any) {
      Alert.alert("Sign up failed", e.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <Image source={require("../../assets/icon.png")} style={styles.logo} />
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Start building your cookbook.</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Name"
            placeholderTextColor="#A9998A"
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#A9998A"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#A9998A"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity
            style={[styles.button, loading && { opacity: 0.6 }]}
            onPress={handleSignup}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? "Creating..." : "Sign up"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}>Log in</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8F0", justifyContent: "center" },
  header: { alignItems: "center", marginBottom: 40 },
  logo: { width: 72, height: 72, borderRadius: 18 },
  title: { fontSize: 24, fontWeight: "800", color: "#2B2118", marginTop: 8, textAlign: "center" },
  subtitle: { fontSize: 15, color: "#8A7A6C", marginTop: 4 },
  form: { paddingHorizontal: 24, gap: 12 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#EFE2D6",
    color: "#2B2118",
  },
  button: {
    backgroundColor: "#E85D3F",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 24 },
  footerText: { color: "#8A7A6C" },
  footerLink: { color: "#E85D3F", fontWeight: "600" },
});
