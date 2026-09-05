// lib/surreal-auth.ts — SurrealDB record-access auth for the site (server-side only).
// Replaces Supabase Auth. Surreal is bound to 127.0.0.1; browsers never call
// it directly — api/api-auth.ts proxies signup/signin/refresh, and every other
// route validates tokens through verify() via lib/api-auth.ts getUser().
//
// Verified shapes (Phase 1 drill 17/17, SurrealDB 3.2.0, 2026-09-05):
// - POST /signup | /signin body {ns, db, ac, email, pass} or {ns, db, ac, refresh}
// - success: {code:200, token:{access:"<jwt>", refresh:"<opaque>"}}
// - wrong password -> HTTP 404; bad/expired token or refresh -> HTTP 401
// - $auth is the RECORD ID in v3 -> SELECT ... FROM ONLY $auth
import { surrealQuery, str, thing } from "./surreal-client";
import { secret } from "./secrets";

const URL_ = () => secret("SURREAL_URL", "http://127.0.0.1:8000");
const NS = () => secret("SURREAL_NS", "zo_space");
const DB = () => secret("SURREAL_DB", "all_creatures");
export const ACCESS = "user_access";

export interface AuthTokens { access: string; refresh: string | null }
export interface AuthUser { id: string; email: string }

const bareUser = (rid: unknown): string => String(rid).replace(/^user:/, "").replace(/[⟨⟩`]/g, "");

async function authPost(path: "/signup" | "/signin", body: Record<string, unknown>): Promise<AuthTokens | null> {
  try {
    const res = await fetch(`${URL_()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ns: NS(), db: DB(), ac: ACCESS, ...body }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null; // 404 = bad credentials, 401 = bad token; both -> null
    const data = (await res.json()) as { token?: string | { access?: string; refresh?: string } };
    const tok = data.token;
    if (!tok) return null;
    if (typeof tok === "string") return { access: tok, refresh: null };
    return tok.access ? { access: tok.access, refresh: tok.refresh ?? null } : null;
  } catch {
    return null;
  }
}

export function signup(email: string, pass: string): Promise<AuthTokens | null> {
  return authPost("/signup", { email: email.trim().toLowerCase(), pass });
}

export function signin(email: string, pass: string): Promise<AuthTokens | null> {
  return authPost("/signin", { email: email.trim().toLowerCase(), pass });
}

export function refresh(refreshToken: string): Promise<AuthTokens | null> {
  return authPost("/signin", { refresh: refreshToken });
}

/** Validate an access token and return the user — the getUser() backbone. */
export async function verify(access: string): Promise<AuthUser | null> {
  if (!access || access.length < 20) return null;
  try {
    const res = await fetch(`${URL_()}/sql`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        Accept: "application/json",
        "Surreal-NS": NS(),
        "Surreal-DB": DB(),
        Authorization: `Bearer ${access}`,
      },
      body: "SELECT id, email FROM ONLY $auth;",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const out = (await res.json()) as Array<{ status: string; result?: { id?: unknown; email?: string } | null }>;
    const row = out?.[0];
    if (!row || row.status !== "OK" || !row.result || !row.result.id) return null;
    return { id: bareUser(row.result.id), email: String(row.result.email ?? "") };
  } catch {
    return null;
  }
}

/** Does this user still carry an imported Supabase bcrypt hash? (root query) */
export async function hasLegacyHash(userId: string): Promise<boolean> {
  const r = await surrealQuery<{ legacy_bcrypt?: string | null } | null>(
    `SELECT legacy_bcrypt FROM ONLY ${thing("user", userId)};`,
  );
  return !!r[0]?.legacy_bcrypt;
}

/** After a successful legacy signin: re-hash to argon2 and drop the bcrypt hash (one-time). */
export async function upgradeLegacyPassword(userId: string, pass: string): Promise<void> {
  await surrealQuery(
    `UPDATE ${thing("user", userId)} SET pass = crypto::argon2::generate(${str(pass)}), legacy_bcrypt = NONE;`,
  );
}

/** Admin (on-box script) reset — no email flows yet, by Sam's decision. */
export async function adminResetPassword(email: string, temp: string): Promise<boolean> {
  const r = await surrealQuery<Array<{ id: unknown }>>(
    `UPDATE user SET pass = crypto::argon2::generate(${str(temp)}), legacy_bcrypt = NONE WHERE email = ${str(email.trim().toLowerCase())} RETURN id;`,
  );
  return (r[0] ?? []).length === 1;
}
