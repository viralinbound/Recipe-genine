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
import { Eye, EyeOff } from "lucide-react-native";

export default function Login() {
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Missing info", "Enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      const msg = e.message?.toLowerCase() || "";
      if (msg.includes("invalid login credentials")) {
        Alert.alert(
          "Login Failed",
          "Account not found or incorrect password. If you don't have an account, please sign up!"
        );
      } else {
        Alert.alert("Login failed", e.message ?? "Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    try {
      await signInWithGoogle();
    } catch (e: any) {
      Alert.alert("Google sign-in failed", e.message ?? "Something went wrong.");
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
          <Text style={styles.title}>Recipe Genie</Text>
          <Text style={styles.subtitle}>Welcome back, chef.</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#A9998A"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Password"
              placeholderTextColor="#A9998A"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity 
              style={styles.eyeIcon} 
              onPress={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff color="#A9998A" size={20} />
              ) : (
                <Eye color="#A9998A" size={20} />
              )}
            </TouchableOpacity>
          </View>

          <Link href="/(auth)/forgot-password" asChild>
            <TouchableOpacity>
              <Text style={styles.link}>Forgot password?</Text>
            </TouchableOpacity>
          </Link>

          <TouchableOpacity
            style={[styles.button, loading && { opacity: 0.6 }]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? "Signing in..." : "Log in"}</Text>
          </TouchableOpacity>

          {/* Hidden on iOS: App Store guideline 4.8 would require Sign in with Apple alongside it. */}
          {Platform.OS !== "ios" && (
            <TouchableOpacity style={styles.googleButton} onPress={handleGoogle}>
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </TouchableOpacity>
          )}

        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <Link href="/(auth)/signup" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}>Sign up</Text>
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
  title: { fontSize: 28, fontWeight: "800", color: "#2B2118", marginTop: 8 },
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
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EFE2D6",
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#2B2118",
  },
  eyeIcon: {
    padding: 14,
  },
  link: { color: "#E85D3F", fontSize: 14, textAlign: "right", marginBottom: 4 },
  button: {
    backgroundColor: "#E85D3F",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  googleButton: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EFE2D6",
  },
  googleButtonText: { color: "#2B2118", fontSize: 16, fontWeight: "500" },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 24 },
  footerText: { color: "#8A7A6C" },
  footerLink: { color: "#E85D3F", fontWeight: "600" },
});
