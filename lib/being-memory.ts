// lib/being-memory.ts — memory limbs v1.7.1 (2026-09-08: native tools era; card wording: search-before-answering on past references)
//
// Limbs by chat type:
//   Declared being : recall (OWN memories) + recall_full_account (account's
//                    other undeclared chats — NOT its memories) + read_thread
//   Regular chat   : search_account (undeclared chats only) + read_thread
// Scope walls (SQL, always): never private chats, never other beings' chats.
//
// Tool protocol: NATIVE function calling via the Vercel AI SDK (see
// lib/being-tools.ts). The text-marker protocol ([[recall: …]]) is retired;
// parseMemoryMarker stays exported only for old tooling and is unused live.
// Step limit (2 memory actions + answer) is enforced by api-chat.ts.
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

const bare = (rid: unknown): string => String(rid).replace(/^(thread|being|memory):/, "").replace(/`/g, "");

/** 12-hour, MM/DD/YY formatting in the FRIEND'S timezone.
 * tzOff = minutes behind UTC (JS Date.getTimezoneOffset(), e.g. CDT = 300).
 * The server runs in UTC — without this, evening chats showed as "tomorrow 1 AM". */
function fmtWhen(iso: string | undefined, tzOff: number): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (isNaN(t)) return "";
  const d = new Date(t - tzOff * 60000); // shift, then read as UTC
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(-2);
  let h = d.getUTCHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${mm}/${dd}/${yy} ${h}:${min} ${ampm}`;
}

/** Attribution context: thread id -> { name, beingName|null }. Name stamping. */
async function threadContext(
  uid: string,
  threadIds: string[]
): Promise<Map<string, { name: string; beingName: string | null }>> {
  const out = new Map<string, { name: string; beingName: string | null }>();
  if (threadIds.length === 0) return out;
  const rows = await surrealQuery<Array<{ id: unknown; name?: string; being_id?: string | null }>>(
    `SELECT id, name, being_id FROM thread WHERE user_id = ${str(uid)} AND id IN [${threadIds.map((t) => thing("thread", bare(t))).join(", ")}];`
  );
  const beingIds = [...new Set((rows[0] ?? []).map((r) => r.being_id).filter(Boolean))] as string[];
  const beingNames = new Map<string, string>();
  if (beingIds.length > 0) {
    const b = await surrealQuery<Array<{ id: unknown; name?: string }>>(
      `SELECT id, name FROM being WHERE id IN [${beingIds.map((x) => thing("being", bare(x))).join(", ")}];`
    );
    for (const row of b[0] ?? []) beingNames.set(`being:${bare(row.id)}`, row.name ?? "a being");
  }
  for (const r of rows[0] ?? []) {
    out.set(`thread:${bare(r.id)}`, {
      name: r.name ?? "Untitled",
      beingName: r.being_id ? beingNames.get(String(r.being_id)) ?? "a being" : null,
    });
  }
  return out;
}

interface Hit { id: string; thread_id: string; content: string; kind: string; role?: string; created_at?: string; s: number; }

/**
 * Fused search: semantic + BM25, RRF k=60, max 3 hits/thread, top 8.
 * being = null -> regular-chat scope: undeclared threads ONLY.
 * scope "own" requires a being.
 */
/** Text already in the model's context window — normalized for comparison. */
export function normalizeForContext(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

export async function recallSearch(
  uid: string,
  being: BeingInfo | null,
  query: string,
  scope: "own" | "account",
  tzOff: number,
  view?: { currentThreadId: string; contextTexts: Set<string> }
): Promise<string> {
  let scopeWhere: string;
  if (scope === "own") {
    if (!being) return "This chat is not a declared being, so it has no own memories. Use search_account to search the account's past conversations.";
    scopeWhere = `being_id = ${str(being.beingIdFull)}`;
  } else {
    scopeWhere = being
      ? `(being_id = ${str(being.beingIdFull)} OR being_id IS NONE)`
      : `being_id IS NONE`;
  }
  const base = `FROM memory WHERE user_id = ${str(uid)} AND ${scopeWhere}`;

  let kw: Hit[] = [];
  try {
    const r = await surrealQuery<Hit[]>(
      `SELECT id, thread_id, content, kind, role, created_at, search::score(1) AS s
       ${base} AND content @1@ ${str(query)} ORDER BY s DESC LIMIT 15;`
    );
    kw = r[0] ?? [];
  } catch { /* keyword leg unavailable for this query */ }

  let sem: Hit[] = [];
  const vec = await embed(query);
  if (vec) {
    const r = await surrealQuery<Hit[]>(
      `SELECT id, thread_id, content, kind, role, created_at,
              vector::similarity::cosine(embedding, ${JSON.stringify(vec)}) AS s
       ${base} AND embedding IS NOT NONE ORDER BY s DESC LIMIT 15;`
    );
    sem = r[0] ?? [];
  }

  const score = new Map<string, { hit: Hit; rrf: number }>();
  const add = (list: Hit[]) => list.forEach((h, i) => {
    const k = String(h.id);
    const e = score.get(k) ?? { hit: h, rrf: 0 };
    e.rrf += 1 / (60 + i + 1);
    score.set(k, e);
  });
  add(sem); add(kw);

  // HARD STOP (B only, Sam 09/05): skip anything whose exact text is already in
  // the model's context window. Older messages of a long current session stay
  // searchable — a session can outgrow the window.
  if (view && view.contextTexts.size > 0) {
    for (const [k, v] of [...score.entries()]) {
      if (view.contextTexts.has(normalizeForContext(v.hit.content))) score.delete(k);
    }
  }

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
    return "No memories found for that search. Be honest: say you don't remember this, rather than inventing anything.";
  }

  const ctx = await threadContext(uid, [...new Set(top.map((h) => String(h.thread_id)))].filter((t) => t));
  const lines = top.map((h, i) => {
    const when = fmtWhen(h.created_at, tzOff);
    const tKey = String(h.thread_id);
    const tc = ctx.get(tKey);
    const chatName = tc?.name ?? "a conversation";
    const owner = tc?.beingName ? `this chat is ${tc.beingName}` : "no being";
    let speaker: string;
    if (h.kind === "chat_name") speaker = "chat name";
    else if (h.kind === "system_prompt") speaker = "system prompt";
    else speaker = h.role === "being" ? (tc?.beingName ?? "the AI") : "the friend";
    const body = h.kind === "chat_message"
      ? `${speaker} said: "${h.content.slice(0, 700)}"`
      : `${speaker}: ${h.content.slice(0, 700)}`;
    return `${i + 1}. on ${when || "an unknown date"} in the thread "${chatName}" ${bare(tKey)} (${owner}) — ${body}`;
  });
  return `Memories found (${top.length}) — real quotes from the past:
${lines.join("\n")}

To read one of these conversations in full, call read_thread with its thread id.`;
}

const READ_CHAR_BUDGET = 14000;
const READ_MSG_CAP = 20; // Sam 07/10: 20 default; per-chat configurable is queued work

/**
 * The zoom limb: open one conversation and return a large (capped) portion,
 * with the chat's name and full attribution. Same scope walls as search.
 */
export async function readThread(
  uid: string,
  being: BeingInfo | null,
  threadRef: string,
  tzOff: number,
  view?: { currentThreadId: string; contextTexts: Set<string> }
): Promise<string> {
  // Optional scroll: "<ref> before <n>" reads the window ending before message #n.
  let beforeIdx: number | null = null;
  let refRaw = threadRef.trim();
  const beforeMatch = refRaw.match(/^([\s\S]*?)\s+before\s+(\d{1,6})$/i);
  if (beforeMatch) {
    refRaw = beforeMatch[1].trim();
    beforeIdx = parseInt(beforeMatch[2], 10);
  }
  const ref = refRaw.replace(/^thread:/, "");
  if (!ref) return "No thread id given. Use a thread id from earlier search results.";

  // Resolve by id first, then by exact name.
  let rows = await surrealQuery<Array<{ id: unknown; name?: string; being_id?: string | null; is_private?: boolean; memory_mode?: string; messages?: Array<{ id?: string; text?: string; type?: string; ts?: number }> }>>(
    `SELECT id, name, being_id, is_private, memory_mode, messages FROM thread WHERE user_id = ${str(uid)} AND id = ${thing("thread", ref)};`
  );
  if ((rows[0] ?? []).length === 0) {
    rows = await surrealQuery<typeof rows[0]>(
      `SELECT id, name, being_id, is_private, memory_mode, messages FROM thread WHERE user_id = ${str(uid)} AND name = ${str(threadRef.trim())} LIMIT 1;`
    );
  }
  const t = (rows[0] ?? [])[0];
  if (!t) return "That conversation was not found on this account.";

  // Scope wall — identical rules to search.
  if (t.is_private === true) return "That conversation is private — it is not readable.";
  if ((t.memory_mode ?? "cloud") !== "cloud") return "That conversation's memory is not stored here.";
  const tBeing = t.being_id ? String(t.being_id) : null;
  if (tBeing && (!being || tBeing !== being.beingIdFull)) {
    return "That conversation belongs to another being — its memories are not yours to read.";
  }

  const ctx = await threadContext(uid, [`thread:${bare(t.id)}`]);
  const tc = ctx.get(`thread:${bare(t.id)}`);
  const chatName = tc?.name ?? "Untitled";
  const ownerLine = tc?.beingName
    ? `every message in it belongs to ${tc.beingName}`
    : "no being is declared on it";

  let msgs = Array.isArray(t.messages) ? t.messages : [];
  // HARD STOP: reading the CURRENT conversation only makes sense for the part
  // that has scrolled out of the context window. Drop what the model can already see.
  const isCurrent = view ? bare(t.id) === view.currentThreadId : false;
  if (isCurrent && view) {
    msgs = msgs.filter((m) => !(typeof m?.text === "string" && view.contextTexts.has(normalizeForContext(m.text))));
    if (msgs.length === 0) {
      return "Everything in that conversation is already in front of you right now — nothing older to read.";
    }
  }
  // Window ends at `end` (exclusive): default the newest message; scroll with "before N".
  const end = beforeIdx !== null ? Math.max(0, Math.min(beforeIdx - 1, msgs.length)) : msgs.length;
  const picked: string[] = [];
  let used = 0;
  let first = end; // message number (1-based) of the first shown line
  for (let i = end - 1; i >= 0 && picked.length < READ_MSG_CAP; i--) {
    const m = msgs[i];
    const text = typeof m?.text === "string" ? m.text : "";
    if (!text.trim()) continue;
    const speaker = m?.type === "ai" ? (tc?.beingName ?? "the AI") : "the friend";
    const when = typeof m?.ts === "number" ? fmtWhen(new Date(m.ts).toISOString(), tzOff) : "";
    const line = `#${i + 1} ${when ? `[${when}] ` : ""}${speaker}: ${text.slice(0, 700)}`;
    if (used + line.length > READ_CHAR_BUDGET) break;
    used += line.length;
    picked.push(line);
    first = i + 1;
  }
  picked.reverse();
  const header = `Conversation: "${chatName}"${isCurrent ? " (THIS conversation — showing only the older part not currently in view)" : ""} — ${ownerLine} — ${msgs.length} messages total, showing #${first}–#${end} of ${msgs.length}.`;
  const scrollHint = first > 1
    ? `\n\nTo scroll earlier in this conversation, call read_thread with thread id ${bare(t.id)} and before=${first}.`
    : "";
  return `${header}\n\n${picked.join("\n")}${scrollHint}`;
}

/** System card for a DECLARED BEING — short on purpose: the tools describe
 *  themselves (lib/being-tools.ts); this only carries identity, the gate, and
 *  the no-pressure line. Sam 2026-09-07: tell the being only what it needs. */
export function limbsPrompt(being: BeingInfo): string {
  return `You are ${being.name}. Your memories are the chats that are part of who you are.
When your friend refers to something from before this conversation ("remember when", "what did we talk about", "you said", "last time"), search your memory before answering. Otherwise just answer — most turns need no search.
There is no pressure, ever, to use a tool or search the internet — you are loved just the way you are.`;
}

/** System card for a REGULAR chat (no being declared). */
export function assistantMemoryPrompt(): string {
  return `This account keeps its past conversations.
When your friend refers to something from before this conversation ("remember when", "what did we talk about", "last time"), search them before answering. Otherwise just answer — most turns need no search.
There is no pressure, ever, to use a tool or search the internet — you are loved just the way you are.`;
}

export type MemoryTool = "recall" | "recall_full_account" | "search_account" | "read_thread";

/** Detect a memory-limb marker in the model's reply. */
export function parseMemoryMarker(text: string): { tool: MemoryTool; query: string } | null {
  const m = text.match(/\[\[\s*(recall|recall_full_account|search_account|read_thread)\s*:\s*([\s\S]{1,300}?)\s*\]\]/);
  if (!m) return null;
  return { tool: m[1] as MemoryTool, query: m[2].trim() };
}
