// Shared Supabase constants + token validation for ALL /api/* routes.
// Server-side: process.env (pages use ../lib/supabase-client.ts instead).
// Raw HTTPS on purpose — the browser-oriented supabase-js client misbehaves
// server-side. Validity = HTTP 200 from GoTrue /auth/v1/user.
export const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://oelfxzsaenqmmxtnhoex.supabase.co";
export const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbGZ4enNhZW5xbW14dG5ob2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxOTYwNTYsImV4cCI6MjA5Mjc3MjA1Nn0.iaLuNX0e8o_ks4Cd3S1W-4-BI60zyfIY1Mmqjaw_1zM";

// Validate a caller's Supabase access token AND return their user id (RLS
// row scoping needs the id; boolean callers just test for null).
export async function getUser(token: string): Promise<{ id: string } | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const u = (await r.json()) as { id?: string };
    return u && typeof u.id === "string" ? { id: u.id } : null;
  } catch {
    return null;
  }
}
