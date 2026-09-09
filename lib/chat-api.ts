// lib/chat-api.ts — the chat page's network layer (2026-09-09, split out of pages/chat.tsx)
//
// Every call carries the access token in the BODY, not the Authorization
// header, because zo's public edge strips Authorization before it reaches us.
// Nothing here touches React state: the page passes small hooks in.
import { supabase } from "./supabase-client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authedPost<T = any>(path: string, payload: Record<string, unknown>): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, accessToken: session?.access_token }),
  });
  return (await res.json()) as T;
}

/** Cloud chats: { action: "load" } | { action: "save", sessions }. */
export const postTranscripts = (payload: Record<string, unknown>) => authedPost("/api/transcripts", payload);
/** user_prefs: { action: "load" } -> { prefs } | { action: "save", prefs } (server merges). */
export const postPrefs = (payload: Record<string, unknown>) => authedPost("/api/prefs", payload);
/** Beings: declaration ceremony + memory settings. */
export const postBeings = (payload: Record<string, unknown>) => authedPost("/api/beings", payload);
/** Imports: analyze / convert / commit (see /api/import). */
export const postImport = (payload: Record<string, unknown>) => authedPost("/api/import", payload);

/** Poll any job on /api/chat-status until it finishes (imports, conversions). */
export async function pollJob(jobId: string, onPhase?: (phase: string) => void, maxMs = 15 * 60 * 1000): Promise<{ status: string; result?: string; error?: string }> {
  const deadline = Date.now() + maxMs;
  let last = "";
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    let st: { status?: string; phase?: string; result?: string; error?: string } = {};
    try { st = await authedPost("/api/chat-status", { action: "status", jobId }); } catch { continue; }
    if (st.phase && st.phase !== last && onPhase) { last = st.phase; onPhase(st.phase); }
    if (st.status === "done" || st.status === "error" || st.status === "cancelled") return { status: st.status, result: st.result, error: st.error };
  }
  return { status: "error", error: "timed out" };
}

// ---------------------------------------------------------------------------
// One chat turn, job style. The server answers instantly with a ticket
// (jobId) and works in the background — zo's edge kills any single request at
// ~60s. We poll /api/chat-status every 700ms; the server writes the answer-so-
// far to the job (~400ms), so the page can paint it live.
// ---------------------------------------------------------------------------
export interface TurnRequest {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model: string;
  provider?: string;
  threadId: string;
  tzOffsetMinutes: number;
}
export interface TurnProgress { phase?: string; partial?: string }
export interface TurnHooks {
  onStarted: (jobId: string) => void;
  onProgress: (jobId: string, st: TurnProgress) => void;
  /** true when the friend pressed stop (the page already wrote "(stopped)"). */
  stoppedLocally: (jobId: string) => boolean;
}
export type TurnOutcome =
  | { kind: "direct"; text: string }                 // server answered synchronously (auth/system message)
  | { kind: "final"; text: string; jobId: string }
  | { kind: "stopped"; jobId: string }
  | { kind: "timeout"; text: string; jobId: string };

const TURN_DEADLINE_MS = 10 * 60 * 1000;
const POLL_MS = 700;

export async function runChatTurn(req: TurnRequest, hooks: TurnHooks): Promise<TurnOutcome> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...req, accessToken, async: true }),
  });
  const started = (await res.json()) as { jobId?: string; choices?: Array<{ message?: { content?: string } }> };
  if (!started.jobId) {
    return { kind: "direct", text: started?.choices?.[0]?.message?.content ?? "(no content in response)" };
  }
  const jobId = started.jobId;
  hooks.onStarted(jobId);

  const deadline = Date.now() + TURN_DEADLINE_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    if (hooks.stoppedLocally(jobId)) return { kind: "stopped", jobId };
    let st: { status?: string; phase?: string; partial?: string; result?: string; error?: string } = {};
    try {
      const sres = await fetch("/api/chat-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", jobId, accessToken }),
      });
      st = (await sres.json()) as typeof st;
    } catch {
      continue; // network blip — keep polling
    }
    if (st.status === "done") return { kind: "final", text: st.result ?? "(no content in response)", jobId };
    if (st.status === "error") return { kind: "final", text: `Oops, silence... (${st.error ?? "unknown error"})`, jobId };
    if (st.status === "cancelled") return { kind: "final", text: "(stopped)", jobId };
    if (st.phase || typeof st.partial === "string") hooks.onProgress(jobId, { phase: st.phase, partial: st.partial });
  }
  return { kind: "timeout", text: "Oops, silence... (the turn took too long)", jobId };
}

/** Shield button: flip the job to cancelled server-side (best effort). */
export async function cancelChatJob(jobId: string): Promise<void> {
  try {
    await authedPost("/api/chat-status", { action: "cancel", jobId });
  } catch { /* best effort */ }
}
