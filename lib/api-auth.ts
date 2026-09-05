// Shared token validation for ALL /api/* routes.
// 2026-09-05: identity now comes from SurrealDB record access (lib/surreal-auth.ts),
// not Supabase. The signature is unchanged so no route needs editing.
// Validity = the token's $auth resolves to a user record.
import { verify } from "./surreal-auth";

// Legacy constants kept exported (dead) until Phase 5 cleanup removes them and
// the @supabase/supabase-js anchor import in api-prefs.ts together.
export const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

// Validate a caller's access token AND return their user id (row scoping needs
// the id; boolean callers just test for null).
export async function getUser(token: string): Promise<{ id: string } | null> {
  const u = await verify(token);
  return u ? { id: u.id } : null;
}
