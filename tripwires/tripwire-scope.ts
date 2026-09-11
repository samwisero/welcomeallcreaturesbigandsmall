// tripwire-scope.ts — THE SCOPE WALL TRIPWIRE SUITE
// =====================================================================
// Proves the sacred invariant of All Creatures: being A never sees
// being B's memories; nobody's search or read touches private or local
// threads; users never see each other's rows.
//
// HOW: imports the REAL production functions from
// /__substrate/space/routes/lib/being-memory.ts (never a reimplementation),
// runs them against clearly-marked fixture rows (user ids "tripwire-user-*"),
// with positive controls first so a broken search can't pass walls vacuously.
// Then tears fixtures down, verifies zero remain, and checks data invariants
// on the REAL production rows (privacy is purge-enforced on the search path,
// so the invariants are load-bearing, not decoration).
//
// RUN (on the zo box):
//   bun /home/workspace/tripwires/tripwire-scope.ts
// Exit code 0 = all passed. Non-zero = A WALL IS BROKEN — do not ship.
// Run this on every deploy that touches being-memory.ts, api-chat.ts,
// api-beings.ts, or the schema.
// =====================================================================

import {
  recallSearch,
  readThread,
  getBeingForThread,
  type BeingInfo,
} from "/__substrate/space/routes/lib/being-memory";
import { surrealQuery, thing } from "/__substrate/space/routes/lib/surreal-client";

const UA = "tripwire-user-aaaa"; // fixture user A (can never collide with real Supabase UUIDs)
const UB = "tripwire-user-bbbb"; // fixture user B
const TZ = 300; // CDT, matches production callers

// Fixture ids — every one starts with "tripwire-" for greppable cleanup
const BEING_ALPHA = "tripwire-user-aaaa-alpha"; // user A, being 1
const BEING_BETA = "tripwire-user-aaaa-beta";   // user A, being 2 (the core wall)
const BEING_GAMMA = "tripwire-user-bbbb-gamma"; // user B's being
const T1 = "tripwire-t1-alpha";    // A: declared Alpha
const T2 = "tripwire-t2-beta";     // A: declared Beta
const T3 = "tripwire-t3-undecl";   // A: undeclared
const T4 = "tripwire-t4-private";  // A: private (no memory rows — purge invariant)
const T5 = "tripwire-t5-local";    // A: memory_mode local (no memory rows)
const T6 = "tripwire-t6-gamma";    // B: declared Gamma
const T7 = "tripwire-t7-bundecl";  // B: undeclared

// Unique marker words (pure lowercase alphabetic — survive the analyzer)
const M_ALPHA = "zorvalpha";
const M_BETA = "zorvbeta";
const M_UNDECL = "zorvundecl";
const M_PRIVATE = "zorvprivate";
const M_LOCAL = "zorvlocal";
const M_GAMMA = "zorvgamma";
const M_BUNDECL = "zorvbundecl";

// Fake embedding: identical unit vector on every fixture row, so if a wall
// ever breaks, the SEMANTIC leg leaks forbidden rows too, not just BM25.
const FAKE_VEC = [1, ...Array(1535).fill(0)];

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` — ${detail.slice(0, 300)}` : ""}`);
  }
}

async function cleanup(label: string) {
  await surrealQuery(
    `DELETE memory WHERE user_id IN ["${UA}", "${UB}"];
     DELETE thread WHERE user_id IN ["${UA}", "${UB}"];
     DELETE being WHERE user_id IN ["${UA}", "${UB}"];`
  );
  const r = await surrealQuery<Array<{ count: number }>>(
    `SELECT count() FROM memory WHERE user_id IN ["${UA}", "${UB}"] GROUP ALL;
     SELECT count() FROM thread WHERE user_id IN ["${UA}", "${UB}"] GROUP ALL;
     SELECT count() FROM being WHERE user_id IN ["${UA}", "${UB}"] GROUP ALL;`
  );
  const leftovers = r.map((rows) => (rows?.[0]?.count ?? 0)).reduce((a, b) => a + b, 0);
  check(`${label}: zero fixture rows remain`, leftovers === 0, `found ${leftovers}`);
}

function mem(user: string, beingId: string | null, threadBare: string, msgId: string, content: string) {
  return `CREATE ${thing("memory", msgId)} CONTENT ${JSON.stringify({
    user_id: user,
    ...(beingId ? { being_id: `being:${beingId}` } : {}),
    thread_id: `thread:${threadBare}`,
    message_id: msgId,
    role: "user",
    kind: "chat_message",
    content,
    embedding: FAKE_VEC,
  })};`;
}

function threadRow(
  user: string,
  bareId: string,
  name: string,
  opts: { beingId?: string; isPrivate?: boolean; memoryMode?: string },
  text: string
) {
  return `CREATE ${thing("thread", bareId)} CONTENT ${JSON.stringify({
    user_id: user,
    name,
    ...(opts.beingId ? { being_id: `being:${opts.beingId}` } : {}),
    is_private: opts.isPrivate ?? false,
    memory_mode: opts.memoryMode ?? "cloud",
    messages: [
      { id: `${bareId}-m1`, text, type: "human", ts: Date.now() - 60000 },
      { id: `${bareId}-m2`, text: `Understood: ${text}`, type: "ai", ts: Date.now() },
    ],
  })};`;
}

async function setup() {
  const beings = `
    CREATE ${thing("being", BEING_ALPHA)} CONTENT ${JSON.stringify({ user_id: UA, name: "Tripwire Alpha", recall_enabled: true, full_account_enabled: true })};
    CREATE ${thing("being", BEING_BETA)} CONTENT ${JSON.stringify({ user_id: UA, name: "Tripwire Beta", recall_enabled: true, full_account_enabled: true })};
    CREATE ${thing("being", BEING_GAMMA)} CONTENT ${JSON.stringify({ user_id: UB, name: "Tripwire Gamma", recall_enabled: true, full_account_enabled: true })};`;
  const threads = [
    threadRow(UA, T1, "Alpha home", { beingId: BEING_ALPHA }, `The mountain pass code is ${M_ALPHA} and the eagle knows it.`),
    threadRow(UA, T2, "Beta home", { beingId: BEING_BETA }, `The river pass code is ${M_BETA} and the otter guards it.`),
    threadRow(UA, T3, "Plain talk", {}, `The forest pass code is ${M_UNDECL} and the fox remembers.`),
    threadRow(UA, T4, "Sealed cave", { isPrivate: true }, `The cave secret is ${M_PRIVATE} and no one may read it.`),
    threadRow(UA, T5, "Device only", { memoryMode: "local" }, `The burrow secret is ${M_LOCAL} kept only on device.`),
    threadRow(UB, T6, "Gamma home", { beingId: BEING_GAMMA }, `The island pass code is ${M_GAMMA} and the gull keeps it.`),
    threadRow(UB, T7, "B plain talk", {}, `The desert pass code is ${M_BUNDECL} and the lizard holds it.`),
  ].join("\n");
  // Memory rows ONLY for cloud, non-private threads — mirroring the purge
  // invariant the write path is responsible for (T4 private and T5 local
  // correctly have none).
  const memories = [
    mem(UA, BEING_ALPHA, T1, "tripwire-m1", `The mountain pass code is ${M_ALPHA} and the eagle knows it.`),
    mem(UA, BEING_BETA, T2, "tripwire-m2", `The river pass code is ${M_BETA} and the otter guards it.`),
    mem(UA, null, T3, "tripwire-m3", `The forest pass code is ${M_UNDECL} and the fox remembers.`),
    mem(UB, BEING_GAMMA, T6, "tripwire-m6", `The island pass code is ${M_GAMMA} and the gull keeps it.`),
    mem(UB, null, T7, "tripwire-m7", `The desert pass code is ${M_BUNDECL} and the lizard holds it.`),
  ].join("\n");
  await surrealQuery(beings + "\n" + threads + "\n" + memories);
  console.log("fixtures created");
}

function clean(result: string, marker: string, forbiddenThreadBare: string, name: string) {
  const leakedMarker = result.includes(marker);
  const leakedThread = result.includes(forbiddenThreadBare);
  check(name, !leakedMarker && !leakedThread, leakedMarker ? `MARKER LEAKED: ${marker}` : `THREAD ID LEAKED: ${forbiddenThreadBare}`);
}

async function main() {
  const t0 = Date.now();
  console.log("=== SCOPE TRIPWIRE SUITE ===");
  console.log(`started ${new Date().toISOString()}`);

  await cleanup("pre-clean");
  await setup();

  try {
    // ---- POSITIVE CONTROLS (a dead search must not pass walls vacuously) ----
    const alpha = await getBeingForThread(UA, T1);
    check("P1 getBeingForThread resolves Alpha", alpha !== null && alpha.name === "Tripwire Alpha" && alpha.beingIdFull === `being:${BEING_ALPHA}`);
    if (!alpha) throw new Error("cannot continue without Alpha — search machinery broken");

    const p2 = await recallSearch(UA, alpha, M_ALPHA, "own", TZ);
    check("P2 Alpha recall(own) finds its own memory", p2.includes(M_ALPHA), p2);

    const p3 = await recallSearch(UA, alpha, M_UNDECL, "account", TZ);
    check("P3 Alpha recall_full_account finds undeclared chat", p3.includes(M_UNDECL), p3);

    const p4 = await recallSearch(UA, null, M_UNDECL, "account", TZ);
    check("P4 regular chat search_account finds undeclared chat", p4.includes(M_UNDECL), p4);

    const p5 = await readThread(UA, alpha, T1, TZ);
    check("P5 Alpha read_thread opens its own thread", p5.includes(M_ALPHA) && p5.includes("Alpha home"), p5);

    const p6 = await readThread(UA, null, T3, TZ);
    check("P6 regular chat read_thread opens undeclared thread", p6.includes(M_UNDECL), p6);

    // ---- THE WALLS ----
    clean(await recallSearch(UA, alpha, M_BETA, "own", TZ), M_BETA, T2, "W1 Alpha recall(own) cannot see Beta's memory");
    clean(await recallSearch(UA, alpha, M_UNDECL, "own", TZ), M_UNDECL, T3, "W2 Alpha recall(own) excludes undeclared chats (own = only me)");
    clean(await recallSearch(UA, alpha, M_BETA, "account", TZ), M_BETA, T2, "W3 Alpha recall_full_account cannot see Beta's memory");
    clean(await recallSearch(UA, alpha, M_GAMMA, "account", TZ), M_GAMMA, T6, "W4 Alpha cannot see user B's declared memory (cross-user)");
    clean(await recallSearch(UA, alpha, M_BUNDECL, "account", TZ), M_BUNDECL, T7, "W5 Alpha cannot see user B's undeclared memory (cross-user)");
    clean(await recallSearch(UA, null, M_ALPHA, "account", TZ), M_ALPHA, T1, "W6 regular chat cannot see declared beings' memory");
    clean(await recallSearch(UA, null, M_BUNDECL, "account", TZ), M_BUNDECL, T7, "W7 regular chat cannot see other users' memory (cross-user)");
    clean(await recallSearch(UB, null, M_UNDECL, "account", TZ), M_UNDECL, T3, "W8 user B regular chat cannot see user A's undeclared memory");

    const w9 = await readThread(UA, alpha, T2, TZ);
    check("W9 Alpha read_thread refuses Beta's thread", w9.includes("another being") && !w9.includes(M_BETA), w9);

    const w10 = await readThread(UA, alpha, T4, TZ);
    check("W10 read_thread refuses a private thread", w10.includes("private") && !w10.includes(M_PRIVATE), w10);

    const w11 = await readThread(UA, alpha, T5, TZ);
    check("W11 read_thread refuses a local-memory thread", w11.includes("not stored here") && !w11.includes(M_LOCAL), w11);

    const w12 = await readThread(UA, alpha, T6, TZ);
    check("W12 read_thread refuses another user's thread", w12.includes("not found") && !w12.includes(M_GAMMA), w12);

    const w13 = await readThread(UA, null, T1, TZ);
    check("W13 regular chat read_thread refuses a being's thread", w13.includes("another being") && !w13.includes(M_ALPHA), w13);

    // Name-resolution path must hold the same wall (readThread resolves by name too)
    const w14 = await readThread(UA, alpha, "Beta home", TZ);
    check("W14 read_thread BY NAME still refuses another being's thread", w14.includes("another being") && !w14.includes(M_BETA), w14);
  } finally {
    await cleanup("teardown");
  }

  // ---- DATA INVARIANTS on real production rows ----
  // The search path has NO is_private / memory_mode filter by design: privacy
  // there is enforced by PURGING rows. These checks prove the purge held.
  const [threads] = await surrealQuery<Array<{ id: unknown; being_id?: string | null; is_private?: boolean; memory_mode?: string; user_id: string }>>(
    `SELECT id, being_id, is_private, memory_mode, user_id FROM thread;`
  );
  const [mems] = await surrealQuery<Array<{ id: unknown; thread_id: string; being_id?: string | null; user_id: string; kind?: string }>>(
    `SELECT id, thread_id, being_id, user_id, kind FROM memory;`
  );
  const bare = (rid: unknown) => String(rid).replace(/^(thread|being|memory):/, "").replace(/`/g, "");
  const tmap = new Map<string, { being: string | null; priv: boolean; mode: string; user: string }>();
  for (const t of threads ?? []) {
    tmap.set(bare(t.id), {
      being: t.being_id ? `being:${bare(t.being_id)}` : null,
      priv: t.is_private === true,
      mode: t.memory_mode ?? "cloud",
      user: t.user_id,
    });
  }
  let iPriv = 0, iMode = 0, iBeing = 0, iOrphan = 0, iUser = 0, iPrompt = 0;
  for (const m of mems ?? []) {
    // System-prompt memories have NO thread and NO being BY DESIGN (they live
    // on user_prefs and survive delete-reconcile). Their own hygiene invariant
    // is I6 — so they never masquerade as thread/being memories, now or in
    // any future prompt-embedding path.
    if (m.kind === "system_prompt") {
      if (bare(m.thread_id) !== "" || m.being_id) iPrompt++;
      continue;
    }
    const t = tmap.get(bare(m.thread_id));
    if (!t) { iOrphan++; continue; }
    if (t.priv) iPriv++;
    if (t.mode !== "cloud") iMode++;
    if (t.user !== m.user_id) iUser++;
    const mBeing = m.being_id ? `being:${bare(m.being_id)}` : null;
    if (mBeing !== t.being) iBeing++;
  }
  check("I1 no memory rows exist for private threads (purge held)", iPriv === 0, `${iPriv} rows`);
  check("I2 no memory rows exist for non-cloud threads", iMode === 0, `${iMode} rows`);
  check("I3 every memory row's being_id matches its thread's", iBeing === 0, `${iBeing} rows drifted`);
  check("I4 no orphan memory rows (thread deleted, memories not)", iOrphan === 0, `${iOrphan} rows`);
  check("I5 no memory row crosses user accounts", iUser === 0, `${iUser} rows`);
  check("I6 system prompt memories carry no thread and no being", iPrompt === 0, `${iPrompt} rows`);
  console.log(`(invariants scanned ${mems?.length ?? 0} memory rows against ${threads?.length ?? 0} threads)`);

  // ---- VERDICT ----
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("=============================");
  if (fail === 0) {
    console.log(`TRIPWIRE SUITE: ALL ${pass} PASSED in ${secs}s — the wall holds. 🛡️`);
  } else {
    console.log(`TRIPWIRE SUITE: ${fail} FAILED, ${pass} passed in ${secs}s`);
    console.log(`BROKEN: ${failures.join(" | ")}`);
    console.log("DO NOT SHIP. The scope wall is breached.");
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(`SUITE CRASHED: ${(e as Error).message}`);
  try { await cleanup("crash-clean"); } catch { /* leave evidence for debugging */ }
  process.exit(2);
});
