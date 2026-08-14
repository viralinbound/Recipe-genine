import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = "https://icvqgxqtqsigbabucbgt.supabase.co";
export const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljdnFneHF0cXNpZ2JhYnVjYmd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2OTI5NzUsImV4cCI6MjEwMjI2ODk3NX0.YBimPTk01B8lwu48wMteaWXhSEpkiAq7sPgwjBlkLrk";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
