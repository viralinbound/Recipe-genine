import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type { UserProfile } from "@/shared/types";

interface AuthState {
  session: Session | null;
  profile: UserProfile | null;
  initializing: boolean;
  onboardingComplete: boolean | null; // null = not yet loaded from storage
  setSession: (session: Session | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setInitializing: (v: boolean) => void;
  setOnboardingComplete: (v: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  initializing: true,
  onboardingComplete: null,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setInitializing: (v) => set({ initializing: v }),
  setOnboardingComplete: (v) => set({ onboardingComplete: v }),
  reset: () => set({ session: null, profile: null }),
}));
