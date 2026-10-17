import { useEffect, useState } from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { handleAuthUrl } from "@/hooks/useAuth";
import { isPasswordRecoveryUrl } from "@/lib/authRedirects";

export default function AuthCallback() {
  const router = useRouter();
  const [status, setStatus] = useState("Signing you in…");

  useEffect(() => {
    let mounted = true;

    const finish = async (url: string | null) => {
      if (url) {
        setStatus("Opening secure link…");
        await handleAuthUrl(url);
      }

      if (!mounted) return;

      // Wait briefly for auth state to settle after verify / exchange
      await new Promise((r) => setTimeout(r, 300));
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (isPasswordRecoveryUrl(url)) {
        router.replace("/auth/reset-password");
        return;
      }

      if (data?.session) {
        router.replace("/(tabs)");
      } else {
        router.replace("/(auth)/login");
      }
    };

    Linking.getInitialURL().then(finish);

    const linkSub = Linking.addEventListener("url", ({ url }) => {
      finish(url);
    });

    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY") {
        router.replace("/auth/reset-password");
      }
      if (event === "SIGNED_IN") {
        // signup confirm / Google — land in app unless this is recovery
        // (recovery handled above)
      }
    });

    return () => {
      mounted = false;
      linkSub.remove();
      authSub.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color="#E85D3F" />
      <Text style={styles.text}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF8F0",
    gap: 12,
    padding: 24,
  },
  text: { fontSize: 14, color: "#8A7A6C", textAlign: "center" },
});
