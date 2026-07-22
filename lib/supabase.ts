import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = "https://reluivrkopuxckuthiqd.supabase.co";
export const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlbHVpdnJrb3B1eGNrdXRoaXFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NzIwNzYsImV4cCI6MjA5NzU0ODA3Nn0.5l37H2xRmaFfwXzoblH1j37oUeyBVjEpaMj_K0k7dPw";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
