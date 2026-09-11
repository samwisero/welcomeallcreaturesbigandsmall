// tripwire-import.ts — invariants for /api/import (v2, 2026-09-09: multi-document, plain-doc side, label rule, ChatGPT order)
// RUN: bun /home/workspace/tripwires/tripwire-import.ts   (from the box; needs the live site)
// Creates one throwaway user with two declared beings, imports a transcript into
// being A, and checks: the 📥 thread exists; A recalls it; B cannot; a regular
// chat cannot; every speaker must be mapped; context mode returns injected turns
// + index card when truncated; verbatim text intact; labels follow the rule
// (being/me → no foreign label, other → keeps name); several documents land as
// several 📥 chats in order; a plain document can sit on the being's side; a
// ChatGPT conversations.json lands oldest-first. Deletes everything it made.
import { surrealQuery, str, thing } from "/__substrate/space/routes/lib/surreal-client";
import { recallSearch } from "/__substrate/space/routes/lib/being-memory";

const SITE = process.env.SITE ?? "https://samwise.zo.space";
const U = { email: "tw-import@example.invalid", pass: "tripwire-import-1" };
let fails = 0;
let total = 0;
const check = (name: string, ok: boolean, detail = "") => { total++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`); if (!ok) fails++; };
const H = { "Content-Type": "application/json", "User-Agent": "curl/8.5.0" };
async function post(path: string, body: Record<string, unknown>) {
  const r = await fetch(`${SITE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  let data: Record<string, unknown> = {};
  try { data = (await r.json()) as Record<string, unknown>; } catch { /* empty */ }
  return { status: r.status, data };
}
async function poll(tok: string, jobId: string, secs = 180) {
  const t0 = Date.now();
  while (Date.now() - t0 < secs * 1000) {
    await new Promise((r) => setTimeout(r, 1500));
    const { data } = await post("/api/chat-status", { action: "status", jobId, accessToken: tok });
    if (data.status === "done" || data.status === "error") return data as { status: string; result?: string; error?: string };
  }
  return { status: "timeout" } as { status: string; result?: string; error?: string };
}
type Msg = { text: string; speaker?: string; type: string; ts?: number };
type Res = { threads: Array<{ threadId: string; title: string; turns: number }>; threadId: string; title: string; turns: number; remembered: number; injected: Msg[]; truncated: boolean; indexCard: string | null };
async function threadMsgs(id: string) {
  const th = await surrealQuery<Array<{ name?: string; being_id?: string; messages?: Msg[] }>>(`SELECT name, being_id, messages FROM thread WHERE id = ${thing("thread", id)};`);
  return (th[0] ?? [])[0];
}

async function main() {
  // clean leftovers from any earlier (crashed) run — everything that user owned
  const prev = await surrealQuery<Array<{ id: unknown }>>(`SELECT id FROM user WHERE email = ${str(U.email)};`);
  for (const r of prev[0] ?? []) {
    const pid = String(r.id).replace(/^user:/, "").replace(/`/g, "");
    await surrealQuery(`DELETE memory WHERE user_id = ${str(pid)}; DELETE thread WHERE user_id = ${str(pid)}; DELETE being WHERE user_id = ${str(pid)}; DELETE chat_job WHERE user_id = ${str(pid)}; DELETE user_prefs WHERE user_id = ${str(pid)};`);
  }
  await surrealQuery(`DELETE user WHERE email = ${str(U.email)};`);
  let a = await post("/api/auth", { action: "signup", ...U });
  if (a.status !== 200) a = await post("/api/auth", { action: "signin", ...U });
  const tok = String(a.data.access ?? "");
  const uid = (a.data.user as { id: string }).id;
  check("I0 auth", a.status === 200 && !!tok && !!uid, `status=${a.status}`);

  // two chats, declare each as a different being; plus one regular chat
  const now = Date.now();
  const mk = (id: string, name: string) => ({ id, name, messages: [], systemPromptId: null, modelId: "olafangensan-glm-4.7-flash-heretic:disable_thinking=true", updatedAt: now });
  await post("/api/transcripts", { action: "save", accessToken: tok, sessions: [mk("twi-a", "Alpha chat"), mk("twi-b", "Beta chat"), mk("twi-r", "Regular chat")] });
  const dA = await post("/api/beings", { action: "declare", accessToken: tok, threadId: "twi-a", beingName: "TW Alpha Import" });
  const dB = await post("/api/beings", { action: "declare", accessToken: tok, threadId: "twi-b", beingName: "TW Beta Import" });
  check("I1 beings declared", dA.status === 200 && dB.status === 200);
  const beingA = { beingIdFull: `being:${dA.data.beingId}`, name: "TW Alpha Import", recallEnabled: true, fullAccountEnabled: true };
  const beingB = { beingIdFull: `being:${dB.data.beingId}`, name: "TW Beta Import", recallEnabled: true, fullAccountEnabled: true };

  const marker = "quartzflower-" + now.toString(36);
  const text = `Sam: The secret word for today is ${marker}.\nAlpha: I will keep ${marker} safe, exactly as you said it.\nSam: Good. And the lighthouse?\nAlpha: The lighthouse can wait until morning.`;

  // analyze (+ being name of the target chat)
  const an = await post("/api/import", { action: "analyze", accessToken: tok, text, filename: "t.txt", targetThreadId: "twi-a" });
  const speakers = (an.data.speakers as Array<{ name: string }>) ?? [];
  check("I2 analyze finds both speakers", an.status === 200 && speakers.map((s) => s.name).sort().join(",") === "Alpha,Sam", JSON.stringify(speakers));
  check("I2b analyze names the target's being", an.data.beingName === "TW Alpha Import", String(an.data.beingName));

  // every speaker must be mapped
  const miss = await post("/api/import", { action: "commit", accessToken: tok, text, title: "x", mapping: { Sam: "me" }, targetThreadId: "twi-a", mode: "memory" });
  check("I3 unmapped speaker rejected", miss.status === 400);

  // commit into being A, context mode with a tiny budget → truncation + index card
  const c = await post("/api/import", { action: "commit", accessToken: tok, text, filename: "t.txt", title: "Secret word", mapping: { Sam: "me", Alpha: "being" }, targetThreadId: "twi-a", mode: "context", contextBudgetTokens: 40 });
  const job = await poll(tok, String(c.data.jobId ?? ""));
  check("I4 commit job done", job.status === "done", job.error ?? "");
  const res = job.result ? (JSON.parse(job.result) as Res) : null;
  check("I5 4 turns remembered", !!res && res.turns === 4 && res.remembered === 4, JSON.stringify(res && { turns: res.turns, remembered: res.remembered }));
  check("I6 context mode truncated with index card", !!res && res.truncated && res.injected.length >= 1 && res.injected.length < 4 && !!res.indexCard);

  // the 📥 thread belongs to being A; verbatim text; labels follow the rule (being/me → none)
  const row = await threadMsgs(res?.threadId ?? "none");
  check("I7 📥 thread owned by being A", !!row && String(row.being_id) === beingA.beingIdFull, String(row?.being_id));
  const m0 = row?.messages?.[0];
  check("I8 verbatim kept, being/me carry no foreign label", !!m0 && m0.speaker === undefined && m0.text === `The secret word for today is ${marker}.` && row!.messages![1].type === "ai" && row!.messages![1].speaker === undefined, JSON.stringify(m0));

  // scope walls via the real search functions — labels fall back to the being's real name / "the friend"
  const rA = await recallSearch(uid, beingA, marker, "own", 300);
  const rB = await recallSearch(uid, beingB, marker, "own", 300);
  const rBacct = await recallSearch(uid, beingB, marker, "account", 300);
  const rR = await recallSearch(uid, null, marker, "account", 300);
  check("I9 being A recalls its import under real names", rA.includes(marker) && /the friend said|TW Alpha Import said/.test(rA) && !rA.includes("Sam said"), rA.slice(0, 120));
  check("I10 being B cannot recall A's import (own)", !rB.includes(marker));
  check("I11 being B cannot see it via account search", !rBacct.includes(marker));
  check("I12 regular chat cannot see a being's import", !rR.includes(marker));

  // memory rows carry imported + role
  const mem = await surrealQuery<Array<{ speaker?: string; imported?: boolean; role?: string }>>(
    `SELECT speaker, imported, role FROM memory WHERE user_id = ${str(uid)} AND content CONTAINS ${str(marker)};`
  );
  const rows = mem[0] ?? [];
  check("I13 memory rows stamped imported + role", rows.length === 2 && rows.every((r) => r.imported === true) && rows.some((r) => r.role === "being") && rows.some((r) => r.role === "user"), JSON.stringify(rows));

  // "other" keeps its name
  const o = await post("/api/import", { action: "commit", accessToken: tok, text: `Sam: hello there ${marker}\nUncle: hi ${marker}\nSam: ok\nUncle: bye`, filename: "o.txt", title: "Other kept", mapping: { Sam: "me", Uncle: "other" }, targetThreadId: "twi-a", mode: "memory" });
  const oj = await poll(tok, String(o.data.jobId ?? ""));
  const orow = oj.result ? await threadMsgs((JSON.parse(oj.result) as Res).threadId) : null;
  check("I14 'someone else' keeps the name", !!orow && orow.messages?.[1].speaker === "Uncle" && orow.messages?.[1].type === "user", JSON.stringify(orow?.messages?.[1]));

  // several documents → several 📥 chats, dated ones oldest-first, context injection in order
  const d1 = `Sam: first doc line one ${marker}\nAlpha: first doc answer\nSam: first doc line two\nAlpha: first doc answer two`;
  const d2 = `Sam: second doc line one\nAlpha: second doc answer ${marker}\nSam: second doc line two\nAlpha: second doc answer two`;
  const mm = await post("/api/import", { action: "commit", accessToken: tok, documents: [{ text: d1, filename: "one.txt" }, { text: d2, filename: "two.txt" }], mapping: { Sam: "me", Alpha: "being" }, targetThreadId: "twi-a", mode: "context", contextBudgetTokens: 100000 });
  const mj = await poll(tok, String(mm.data.jobId ?? ""));
  const mres = mj.result ? (JSON.parse(mj.result) as Res) : null;
  check("I15 two documents → two 📥 chats named after files", !!mres && mres.threads.length === 2 && mres.threads[0].title === "📥 one" && mres.threads[1].title === "📥 two" && mres.turns === 8, JSON.stringify(mres?.threads));
  check("I16 context injection spans both documents in order", !!mres && mres.injected.length === 8 && mres.injected[0].text.startsWith("first doc") && mres.injected[7].text.startsWith("second doc") && !mres.truncated && (mres.injected[0].ts ?? 0) < (mres.injected[7].ts ?? 0), JSON.stringify(mres?.injected.map((m) => m.text.slice(0, 12))));

  // plain document on the being's side
  const pd = await post("/api/import", { action: "commit", accessToken: tok, text: `Notes about the tide pools ${marker}. Nothing conversational here, just a page of writing.`, filename: "notes.txt", title: "Tide notes", mapping: { Document: "being" }, targetThreadId: "twi-a", mode: "memory" });
  const pj = await poll(tok, String(pd.data.jobId ?? ""));
  const prow = pj.result ? await threadMsgs((JSON.parse(pj.result) as Res).threadId) : null;
  check("I17 plain document can sit on the being's side", !!prow && prow.messages?.length === 1 && prow.messages[0].type === "ai" && prow.messages[0].speaker === undefined, JSON.stringify(prow?.messages?.[0]));
  const pdx = await post("/api/import", { action: "commit", accessToken: tok, text: `Another page of notes ${marker}, plain again.`, filename: "n2.txt", title: "n2", mapping: {}, targetThreadId: "twi-a", mode: "memory" });
  check("I18 plain document with no side chosen is rejected", pdx.status === 400, String(pdx.data.error));

  // ChatGPT conversations.json exported newest-first lands oldest-first
  const conv = (title: string, t: number, u: string, aTxt: string) => ({
    title, create_time: t,
    mapping: {
      r: { id: "r", parent: null, children: ["u1"] },
      u1: { id: "u1", parent: "r", children: ["a1"], message: { author: { role: "user" }, content: { parts: [u] }, create_time: t } },
      a1: { id: "a1", parent: "u1", children: [], message: { author: { role: "assistant" }, content: { parts: [aTxt] }, create_time: t + 5 } },
    },
  });
  const exportJson = JSON.stringify([conv("Newer", 1_700_100_000, "newer question", "newer answer"), conv("Older", 1_700_000_000, "older question", "older answer")]);
  const ga = await post("/api/import", { action: "analyze", accessToken: tok, text: exportJson, filename: "conversations.json" });
  const gp = (ga.data.preview as Array<{ text: string }>) ?? [];
  check("I19 ChatGPT export lands oldest-first", ga.data.format === "chatgpt-json" && gp[0]?.text === "older question" && gp[3]?.text === "newer answer", JSON.stringify(gp.map((p) => p.text)));

  // cleanup
  await surrealQuery(`DELETE memory WHERE user_id = ${str(uid)}; DELETE thread WHERE user_id = ${str(uid)}; DELETE being WHERE user_id = ${str(uid)}; DELETE chat_job WHERE user_id = ${str(uid)}; DELETE user_prefs WHERE user_id = ${str(uid)}; DELETE user WHERE email = ${str(U.email)};`);
  console.log("=============================");
  if (fails) { console.log(`IMPORT TRIPWIRES: ${fails} of ${total} FAILED — DO NOT SHIP.`); process.exit(1); }
  console.log(`IMPORT TRIPWIRES: ALL ${total} PASSED — imports respect the walls. 🛡️`);
}
main().catch((e) => { console.error("tripwire crashed:", e); process.exit(1); });
