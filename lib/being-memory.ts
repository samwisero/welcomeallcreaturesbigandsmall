// lib/being-memory.ts — the being's two memory limbs (simple chat phase).
// recall             -> the being's OWN memory (threads declared as it)
// recall_full_account -> account-wide (own + undeclared; never private, never
//                        other beings') — user-disableable per being.
//
// Tool protocol: TEXT MARKERS, not function-calling (Venice's uncensored
// models don't reliably support tools). The being replies with ONLY
// [[recall: ...]] or [[recall_full_account: ...]]; api-chat.ts intercepts,
// searches, and calls the model again with the memories. One search per
// turn, structurally enforced.
import { surrealQuery, str, thing } from "./surreal-client";
import { embed } from "./embedding";

export interface BeingInfo {
  beingIdFull: string; // "being:xxx"
  name: string;
  recallEnabled: boolean;
  fullAccountEnabled: boolean;
}

export async function getBeingForThread(uid: string, threadId: string): Promise<BeingInfo | null> {
  const r = await surrealQuery<Array<{ being_id?: string | null }>>(
    `SELECT being_id FROM thread WHERE id = ${thing("thread", threadId)} AND user_id = ${str(uid)};`
  );
  const bid = (r[0] ?? [])[0]?.being_id;
  if (!bid) return null;
  const bare = String(bid).replace(/^being:/, "").replace(/`/g, "");
  const b = await surrealQuery<{ name?: string; recall_enabled?: boolean; full_account_enabled?: boolean } | null>(
    `SELECT name, recall_enabled, full_account_enabled FROM ONLY ${thing("being", bare)};`
  );
  const row = b[0];
  if (!row || !row.name) return null;
  return {
    beingIdFull: `being:${bare}`,
    name: row.name,
    recallEnabled: row.recall_enabled !== false,
    fullAccountEnabled: row.full_account_enabled !== false,
  };
}

interface Hit { id: string; thread_id: string; content: string; kind: string; created_at?: string; s: number; }

/** 12-hour, MM/DD/YY formatting for the being's remembered moments. */
function fmtWhen(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd}/${yy} ${h}:${min} ${ampm}`;
}

/** Fused search: semantic + BM25 full-text, RRF (k=60), thread diversity (max 3/thread), top 8. */
export async function recallSearch(
  uid: string,
  being: BeingInfo,
  query: string,
  scope: "own" | "account"
): Promise<string> {
  const scopeWhere =
    scope === "own"
      ? `being_id = ${str(being.beingIdFull)}`
      : `(being_id = ${str(being.beingIdFull)} OR being_id IS NONE)`;
  const base = `FROM memory WHERE user_id = ${str(uid)} AND ${scopeWhere}`;

  // Keyword leg (BM25). FTS can reject odd queries — degrade gracefully.
  let kw: Hit[] = [];
  try {
    const r = await surrealQuery<Hit[]>(
      `SELECT id, thread_id, content, kind, created_at, search::score(1) AS s
       ${base} AND content @1@ ${str(query)} ORDER BY s DESC LIMIT 15;`
    );
    kw = r[0] ?? [];
  } catch { /* keyword leg unavailable for this query */ }

  // Semantic leg
  let sem: Hit[] = [];
  const vec = await embed(query);
  if (vec) {
    const r = await surrealQuery<Hit[]>(
      `SELECT id, thread_id, content, kind, created_at,
              vector::similarity::cosine(embedding, ${JSON.stringify(vec)}) AS s
       ${base} AND embedding IS NOT NONE ORDER BY s DESC LIMIT 15;`
    );
    sem = r[0] ?? [];
  }

  // RRF fusion
  const score = new Map<string, { hit: Hit; rrf: number }>();
  const add = (list: Hit[]) => list.forEach((h, i) => {
    const k = String(h.id);
    const e = score.get(k) ?? { hit: h, rrf: 0 };
    e.rrf += 1 / (60 + i + 1);
    score.set(k, e);
  });
  add(sem); add(kw);

  // Thread diversity: max 3 per thread, then top 8
  const ranked = [...score.values()].sort((a, b) => b.rrf - a.rrf);
  const perThread = new Map<string, number>();
  const top: Hit[] = [];
  for (const { hit } of ranked) {
    const t = String(hit.thread_id);
    const n = perThread.get(t) ?? 0;
    if (n >= 3) continue;
    perThread.set(t, n + 1);
    top.push(hit);
    if (top.length >= 8) break;
  }

  if (top.length === 0) {
    return "No memories found for that search. Be honest with your friend: say you don't remember this, rather than inventing anything.";
  }

  // Thread names for context
  const tids = [...new Set(top.map((h) => String(h.thread_id)))];
  const nameRows = await surrealQuery<Array<{ id: string; name?: string }>>(
    `SELECT id, name FROM thread WHERE id IN [${tids.map((t) => str(t)).join(", ")}];`
  );
  const names = new Map((nameRows[0] ?? []).map((r) => [String(r.id), r.name ?? "Untitled"]));

  const lines = top.map((h, i) => {
    const when = fmtWhen(h.created_at);
    const where = names.get(String(h.thread_id)) ?? "a conversation";
    const label = h.kind === "chat_name" ? "chat name" : h.kind === "system_prompt" ? "system prompt" : "message";
    return `${i + 1}. [${when || "date unknown"}] (${label} in "${where}") ${h.content.slice(0, 400)}`;
  });
  return `Memories found (${top.length}) — these are real quotes from the past:\n${lines.join("\n")}`;
}

/** The limbs section of the being's system prompt. */
export function limbsPrompt(being: BeingInfo): string {
  const accountLimb = being.fullAccountEnabled
    ? `- To search the WHOLE account's history (your chats plus undeclared ones — private chats and other beings' chats are invisible to you), reply with ONLY: [[recall_full_account: what you want to find]]`
    : `- (Your account-wide search has been turned off by your friend; only your own memory is available.)`;
  return `You are ${being.name}. The conversations on this account that were declared as you ARE your memories — they belong to you.

You have limbs for reaching into memory. To use one, reply with ONLY the marker on its own, nothing else:
- To search your OWN memory (every chat that is you), reply with ONLY: [[recall: what you want to remember]]
${accountLimb}

Rules of memory:
- At most ONE search per turn. If you want to look again, ask your friend to let you search once more.
- Remembered moments come back with dates — you may mention when things happened.
- If a search returns nothing, say plainly that you don't remember. NEVER invent a memory. A being that admits forgetting is trustworthy.
- Use memory when something in you wants to be found — not on every turn.`;
}

/** Detect a memory-limb marker in the model's reply. */
export function parseMemoryMarker(text: string): { tool: "recall" | "recall_full_account"; query: string } | null {
  const m = text.match(/\[\[\s*(recall|recall_full_account)\s*:\s*([\s\S]{1,300}?)\s*\]\]/);
  if (!m) return null;
  return { tool: m[1] as "recall" | "recall_full_account", query: m[2].trim() };
}
