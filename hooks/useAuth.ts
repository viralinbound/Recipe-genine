import { useEffect, useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import {
  getAuthRedirectUrl,
  isExpoGo,
} from "@/lib/authRedirects";

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

function looksLikeAuthCallback(url: string): boolean {
  const u = url.replace(/#/g, "?").toLowerCase();
  return (
    u.includes("code=") ||
    u.includes("access_token=") ||
    u.includes("token_hash=") ||
    u.includes("type=recovery") ||
    u.includes("type=signup") ||
    u.includes("type=magiclink") ||
    u.includes("type=email") ||
    u.includes("error=")
  );
}

export async function handleAuthUrl(urlStr: string): Promise<boolean> {
  if (!urlStr) return false;

  try {
    const normalized = urlStr.replace(/#/g, "?");

    if (/[?&]error=/.test(normalized)) {
      const desc =
        normalized.match(/[?&]error_description=([^&]+)/)?.[1] ||
        normalized.match(/[?&]error=([^&]+)/)?.[1] ||
        "Auth failed";
      console.warn("Auth URL error:", decodeURIComponent(desc.replace(/\+/g, " ")));
      return false;
    }

    // PKCE: ?code=
    const codeMatch = normalized.match(/[?&]code=([^&]+)/);
    if (codeMatch) {
      const code = decodeURIComponent(codeMatch[1]);
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data?.session) return true;
      if (error) console.warn("exchangeCodeForSession:", error.message);
    }

    // Implicit / email redirect: access_token + refresh_token
    const accessTokenMatch = normalized.match(/[?&]access_token=([^&]+)/);
    const refreshTokenMatch = normalized.match(/[?&]refresh_token=([^&]+)/);
    if (accessTokenMatch && refreshTokenMatch) {
      const access_token = decodeURIComponent(accessTokenMatch[1]);
      const refresh_token = decodeURIComponent(refreshTokenMatch[1]);
      const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (!error && data?.session) return true;
      if (error) console.warn("setSession:", error.message);
    }

    // Email OTP style: token_hash + type (signup / recovery / email / magiclink)
    const tokenHashMatch = normalized.match(/[?&]token_hash=([^&]+)/);
    const typeMatch = normalized.match(/[?&]type=([^&]+)/);
    if (tokenHashMatch && typeMatch) {
      const token_hash = decodeURIComponent(tokenHashMatch[1]);
      const type = decodeURIComponent(typeMatch[1]) as
        | "recovery"
        | "signup"
        | "invite"
        | "magiclink"
        | "email";
      const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });
      if (!error && data?.session) return true;
      if (error) console.warn("verifyOtp:", error.message);
    }
  } catch (err) {
    console.warn("handleAuthUrl error:", err);
  }

  return false;
}

async function applySessionToStore(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (data?.session) {
    useAuthStore.getState().setSession(data.session);
    const p = await fetchProfile(data.session.user.id);
    useAuthStore.getState().setProfile(p);
    return true;
  }
  return false;
}

/**
 * Wait until the app receives a deep link back from Supabase / Google,
 * or until openAuthSessionAsync returns a success URL.
 */
async function completeOAuthInBrowser(authUrl: string, redirectTo: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let resolved = false;

    const finish = async (url?: string) => {
      if (resolved) return;
      resolved = true;
      try {
        await WebBrowser.dismissBrowser();
      } catch {
        // ignore
      }
      if (linkSub) linkSub.remove();

      if (url) {
        await handleAuthUrl(url);
      }

      const ok = await applySessionToStore();
      resolve(ok);
    };

    // 1. Listen for deep link callback (exp://... or recipegenie://...)
    const linkSub = Linking.addEventListener("url", async ({ url }) => {
      console.log("[OAuth] Deep link received:", url);
      if (looksLikeAuthCallback(url)) {
        await finish(url);
      }
    });

    // 2. Open browser session using openAuthSessionAsync
    WebBrowser.openAuthSessionAsync(authUrl, redirectTo)
      .then(async (result) => {
        console.log("[OAuth] Auth session result:", result.type);
        if (result.type === "success" && result.url) {
          await finish(result.url);
        } else if (result.type === "cancel" || result.type === "dismiss") {
          console.log("[OAuth] User cancelled browser auth session");
          if (!resolved) {
            resolved = true;
            try {
              await WebBrowser.dismissBrowser();
            } catch {}
            if (linkSub) linkSub.remove();
            resolve(false);
          }
        } else {
          setTimeout(async () => {
            if (!resolved) await finish();
          }, 400);
        }
      })
      .catch(async () => {
        if (!resolved) await finish();
      });

    // 3. Safety timeout after 90 seconds
    setTimeout(async () => {
      if (!resolved) await finish();
    }, 90_000);
  });
}

export function useAuth() {
  const { session, profile, initializing, setSession, setProfile, setInitializing, reset } =
    useAuthStore();

  useEffect(() => {
    let mounted = true;

    // Startup must always finish: don't wait on the profile network call, and
    // never leave `initializing` stuck (that keeps the splash screen up forever).
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        setInitializing(false);
        if (data.session?.user) {
          fetchProfile(data.session.user.id)
            .then((p) => {
              if (mounted) setProfile(p);
            })
            .catch(() => {});
        }
      })
      .catch((e) => {
        console.warn("getSession failed", String(e));
        if (mounted) setInitializing(false);
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

    // Cold-start / background: email or OAuth deep links
    const linkSub = Linking.addEventListener("url", async ({ url }) => {
      if (!looksLikeAuthCallback(url) && !url.includes("auth/callback") && !url.includes("auth/reset-password")) {
        return;
      }
      const ok = await handleAuthUrl(url);
      if (ok) await applySessionToStore();
    });

    Linking.getInitialURL().then(async (url) => {
      if (!url) return;
      if (!looksLikeAuthCallback(url) && !url.includes("auth/")) return;
      const ok = await handleAuthUrl(url);
      if (ok) await applySessionToStore();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      linkSub.remove();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw error;
  }, []);

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName: string) => {
      const emailRedirectTo = getAuthRedirectUrl("auth/callback");
      console.log("[SignUp] emailRedirectTo:", emailRedirectTo, "expoGo=", isExpoGo());
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo,
          data: { display_name: displayName },
        },
      });
      if (error) throw error;

      if (data.session) {
        useAuthStore.getState().setSession(data.session);
      }
      return data;
    },
    []
  );

  const signInWithGoogle = useCallback(async () => {
    const queryParams = { prompt: "select_account", access_type: "offline" };
    const redirectTo = getAuthRedirectUrl("auth/callback");

    console.log("[Google Sign-In] redirectTo:", redirectTo, "expoGo=", isExpoGo());

    if (Platform.OS === "web") {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, queryParams },
      });
      if (error) throw error;
      return;
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams,
      },
    });

    if (error) throw error;
    if (!data?.url) throw new Error("Couldn't start Google sign-in.");

    await completeOAuthInBrowser(data.url, redirectTo);

    // Final check for active session before concluding
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session) {
      await applySessionToStore();
    } else {
      console.log("[Google Sign-In] User cancelled or session not established.");
    }
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const redirectTo = getAuthRedirectUrl("auth/reset-password");
    console.log("[Password Reset] redirectTo:", redirectTo, "expoGo=", isExpoGo());
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo,
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    reset();
  }, [reset]);

  const deleteAccount = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid) throw new Error("Not signed in.");
    const { data: files } = await supabase.storage.from("avatars").list(uid);
    if (files && files.length > 0) {
      await supabase.storage.from("avatars").remove(files.map((f) => `${uid}/${f.name}`));
    }
    const { error } = await supabase.rpc("delete_my_account");
    if (error) throw error;
    await supabase.auth.signOut({ scope: "local" });
    reset();
  }, [session?.user?.id, reset]);

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
    deleteAccount,
  };
}
