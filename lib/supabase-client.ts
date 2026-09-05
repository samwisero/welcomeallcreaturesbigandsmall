// lib/supabase-client.ts — DROP-IN AUTH SHIM (SurrealDB record access behind /api/auth).
//
// History: this file used to create the Supabase client. Supabase Auth was
// replaced 2026-09-05 (free tier auto-paused and took login down). To keep
// the blast radius tiny, this module exports an object with the SAME
// `supabase.auth.*` surface the pages already call:
//   getSession() -> { data: { session } }        session = { access_token, user }
//   onAuthStateChange(cb) -> { data: { subscription: { unsubscribe } } }
//   signOut() -> Promise<void>
//   signUp({ email, password }) -> { error }
//   signInWithPassword({ email, password }) -> { error }
// Tokens live in localStorage (same trust model supabase-js used) and refresh
// silently when the access token is near expiry or a call returns 401.
// File name kept on purpose so no page import paths change; rename later.

export interface AuthUser { id: string; email: string }
export interface Session { access_token: string; refresh_token: string | null; user: AuthUser; expires_at: number }
type AuthEvent = "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "INITIAL_SESSION";
type Listener = (event: AuthEvent, session: Session | null) => void;

const KEY = "ac.auth.session.v1";
const listeners = new Set<Listener>();
let refreshing: Promise<Session | null> | null = null;

function jwtExp(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp * 1000 : Date.now() + 10 * 60 * 1000;
  } catch {
    return Date.now() + 10 * 60 * 1000;
  }
}

function load(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s && s.access_token && s.user ? s : null;
  } catch {
    return null;
  }
}

function save(s: Session | null, event: AuthEvent): void {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch { /* storage unavailable — session lives in memory only */ }
  for (const l of listeners) {
    try { l(event, s); } catch { /* listener errors never break auth */ }
  }
}

function toSession(d: { access?: string; refresh?: string | null; user?: AuthUser | null }, fallbackUser?: AuthUser): Session | null {
  const user = d.user ?? fallbackUser;
  if (!d.access || !user) return null;
  return { access_token: d.access, refresh_token: d.refresh ?? null, user, expires_at: jwtExp(d.access) };
}

async function api(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let data: Record<string, unknown> = {};
    try { data = (await res.json()) as Record<string, unknown>; } catch { /* empty body */ }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Network error — please try again." } };
  }
}

async function doRefresh(current: Session): Promise<Session | null> {
  if (!current.refresh_token) return null;
  const r = await api({ action: "refresh", refresh: current.refresh_token });
  if (!r.ok) return null;
  const next = toSession(r.data as { access?: string; refresh?: string | null }, current.user);
  if (next) save(next, "TOKEN_REFRESHED");
  return next;
}

/** Returns a session whose access token is good for at least ~60s, refreshing if needed. */
async function getSession(): Promise<{ data: { session: Session | null } }> {
  const s = load();
  if (!s) return { data: { session: null } };
  if (s.expires_at - Date.now() > 60 * 1000) return { data: { session: s } };
  if (!refreshing) refreshing = doRefresh(s).finally(() => { refreshing = null; });
  const next = await refreshing;
  if (!next) save(null, "SIGNED_OUT");
  return { data: { session: next } };
}

function onAuthStateChange(cb: Listener): { data: { subscription: { unsubscribe: () => void } } } {
  listeners.add(cb);
  // Mirror supabase-js: emit the current state once, asynchronously.
  setTimeout(() => { try { cb("INITIAL_SESSION", load()); } catch { /* ignore */ } }, 0);
  return { data: { subscription: { unsubscribe: () => { listeners.delete(cb); } } } };
}

async function signOut(): Promise<void> {
  void api({ action: "signout" });
  save(null, "SIGNED_OUT");
}

async function signUp(args: { email: string; password: string }): Promise<{ error: { message: string } | null }> {
  const r = await api({ action: "signup", email: args.email, pass: args.password });
  if (!r.ok) return { error: { message: String(r.data.error ?? "Could not create account.") } };
  const s = toSession(r.data as { access?: string; refresh?: string | null; user?: AuthUser | null });
  if (!s) return { error: { message: "Account created but sign-in failed — please sign in." } };
  save(s, "SIGNED_IN");
  return { error: null };
}

async function signInWithPassword(args: { email: string; password: string }): Promise<{ error: { message: string } | null }> {
  const r = await api({ action: "signin", email: args.email, pass: args.password });
  if (!r.ok) return { error: { message: String(r.data.error ?? "Email or password is incorrect.") } };
  const s = toSession(r.data as { access?: string; refresh?: string | null; user?: AuthUser | null });
  if (!s) return { error: { message: "Sign-in failed — please try again." } };
  save(s, "SIGNED_IN");
  return { error: null };
}

export const supabase = {
  auth: { getSession, onAuthStateChange, signOut, signUp, signInWithPassword },
};
