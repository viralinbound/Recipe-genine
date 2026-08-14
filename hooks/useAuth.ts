import { useEffect, useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

WebBrowser.maybeCompleteAuthSession();

async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn("fetchProfile error", error.message);
    return null;
  }
  return data;
}

export function useAuth() {
  const { session, profile, initializing, setSession, setProfile, setInitializing, reset } =
    useAuthStore();

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        const p = await fetchProfile(data.session.user.id);
        if (mounted) setProfile(p);
      }
      setInitializing(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        const p = await fetchProfile(newSession.user.id);
        setProfile(p);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName: string) => {
      // Pass the name as auth user metadata rather than upserting a profiles
      // row directly: signUp() doesn't yield an active session when email
      // confirmation is required, so a client-side upsert here would be
      // silently blocked by RLS. The on_auth_user_created DB trigger reads
      // raw_user_meta_data.display_name and creates the profile row itself
      // (as SECURITY DEFINER, so it isn't subject to that timing issue).
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
      if (error) throw error;
    },
    []
  );

  const signInWithGoogle = useCallback(async () => {
    const redirectTo = Linking.createURL("auth/callback");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (data?.url) {
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === "success" && result.url) {
        const url = new URL(result.url);
        const params = new URLSearchParams(url.hash.replace("#", "?").split("?")[1] || "");
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token });
        }
      }
    }
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const redirectTo = Linking.createURL("auth/reset-password");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    reset();
  }, [reset]);

  return {
    session,
    user: session?.user ?? null,
    profile,
    initializing,
    isAuthenticated: !!session,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    sendPasswordReset,
    signOut,
  };
}
