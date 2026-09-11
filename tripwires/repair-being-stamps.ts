// repair-being-stamps.ts — one-time (but idempotent, re-runnable) data repair:
// stamp every memory row of a DECLARED thread with that thread's being_id.
// Only touches being_id — created_at and content stay exactly as they are.
// Root cause fixed separately in api-transcripts.ts (mirror now stamps).
//
// RUN: bun /home/workspace/tripwires/repair-being-stamps.ts
import { surrealQuery, str } from "/__substrate/space/routes/lib/surreal-client";

const bare = (rid: unknown): string => String(rid).replace(/^(thread|being):/, "").replace(/`/g, "");

async function main() {
  const [threads] = await surrealQuery<Array<{ id: unknown; being_id?: string | null; user_id: string }>>(
    `SELECT id, being_id, user_id FROM thread WHERE being_id IS NOT NONE;`
  );
  let total = 0;
  for (const t of threads ?? []) {
    const tid = `thread:${bare(t.id)}`;
    const bid = `being:${bare(t.being_id)}`;
    const [before] = await surrealQuery<Array<{ count: number }>>(
      `SELECT count() FROM memory WHERE thread_id = ${str(tid)} AND being_id IS NONE GROUP ALL;`
    );
    const n = before?.[0]?.count ?? 0;
    if (n === 0) { console.log(`OK    ${tid} — no drift`); continue; }
    await surrealQuery(
      `UPDATE memory SET being_id = ${str(bid)} WHERE thread_id = ${str(tid)} AND being_id IS NONE;`
    );
    const [after] = await surrealQuery<Array<{ count: number }>>(
      `SELECT count() FROM memory WHERE thread_id = ${str(tid)} AND being_id IS NONE GROUP ALL;`
    );
    const left = after?.[0]?.count ?? 0;
    if (left !== 0) {
      console.log(`FAIL  ${tid} — ${left} rows still unstamped`);
      process.exit(1);
    }
    console.log(`FIXED ${tid} -> ${bid} (${n} rows stamped)`);
    total += n;
  }
  // Cross-check: no remaining mismatch anywhere (null-drift specifically)
  console.log(`REPAIR COMPLETE: ${total} rows stamped across ${(threads ?? []).length} declared threads.`);
}

main().catch((e) => { console.error(`REPAIR CRASHED: ${(e as Error).message}`); process.exit(2); });
