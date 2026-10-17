import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuth";

export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!email) {
      Alert.alert("Missing email", "Enter your account email.");
      return;
    }
    setLoading(true);
    try {
      await sendPasswordReset(email.trim());
      Alert.alert("Email sent", "Check your inbox for a reset link.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Couldn't send reset email", e.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.back} onPress={() => router.back()}>
        <ArrowLeft size={22} color="#2B2118" />
      </TouchableOpacity>
      <Text style={styles.title}>Reset your password</Text>
      <Text style={styles.subtitle}>
        We'll email you a link. Open it on your phone — Recipe Genie will open so you can set a full new password.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#A9998A"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TouchableOpacity
        style={[styles.button, loading && { opacity: 0.6 }]}
        onPress={handleReset}
        disabled={loading}
      >
        <Text style={styles.buttonText}>{loading ? "Sending..." : "Send reset link"}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8F0", padding: 24, paddingTop: 60 },
  back: { marginBottom: 24 },
  title: { fontSize: 24, fontWeight: "800", color: "#2B2118", marginBottom: 8 },
  subtitle: { fontSize: 15, color: "#8A7A6C", marginBottom: 24 },
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
  button: { backgroundColor: "#E85D3F", borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
