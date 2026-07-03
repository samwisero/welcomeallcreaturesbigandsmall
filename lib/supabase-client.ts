// The ONE Supabase client + project constants for every PAGE route
// (/chat, /auth, /auth/callback, /). Client-side: uses import.meta.env.
// API routes must NOT import this — they use ../lib/api-auth.ts (process.env).
import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://oelfxzsaenqmmxtnhoex.supabase.co";
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbGZ4enNhZW5xbW14dG5ob2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxOTYwNTYsImV4cCI6MjA5Mjc3MjA1Nn0.iaLuNX0e8o_ks4Cd3S1W-4-BI60zyfIY1Mmqjaw_1zM";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
