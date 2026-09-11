// tripwire-auth.ts — auth invariants for the SurrealDB record-access front door.
// RUN: bun /home/workspace/tripwires/tripwire-auth.ts
// Creates two throwaway users (tw-a@example.invalid, tw-b@example.invalid),
// exercises the LIVE /api/auth route + one data route, then deletes them.
// Exit 1 on any failure. Uses the real ns/db — throwaway rows only.
import { surrealQuery, str } from "/__substrate/space/routes/lib/surreal-client";

const SITE = process.env.SITE ?? "https://samwise.zo.space";
const A = { email: "tw-a@example.invalid", pass: "tripwire-pass-A1" };
const B = { email: "tw-b@example.invalid", pass: "tripwire-pass-B1" };
let fails = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  if (!ok) fails++;
};
async function auth(body: Record<string, unknown>) {
  const r = await fetch(`${SITE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let data: Record<string, unknown> = {};
  try { data = (await r.json()) as Record<string, unknown>; } catch { /* empty */ }
  return { status: r.status, data };
}
async function transcripts(accessToken: string) {
  const r = await fetch(`${SITE}/api/transcripts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "load", accessToken }) });
  return { status: r.status, data: (await r.json()) as { sessions?: Array<{ id: string }> } };
}

async function main() {
  // clean any leftovers
  await surrealQuery(`DELETE user WHERE email IN [${str(A.email)}, ${str(B.email)}];`);

  // 1. signup both
  const sa = await auth({ action: "signup", ...A });
  const sb = await auth({ action: "signup", ...B });
  check("A1 signup A returns access+refresh", sa.status === 200 && !!sa.data.access && !!sa.data.refresh);
  check("A2 signup B returns access+refresh", sb.status === 200 && !!sb.data.access);
  const dup = await auth({ action: "signup", ...A });
  check("A3 duplicate signup rejected", dup.status !== 200);

  // 2. wrong password / bad token
  const wrong = await auth({ action: "signin", email: A.email, pass: "nope-nope-nope" });
  check("A4 wrong password rejected", wrong.status === 401);
  const badMe = await auth({ action: "me", accessToken: "garbage.garbage.garbage" });
  check("A5 garbage token rejected by me", badMe.status === 401);
  const badLoad = await transcripts("garbage.garbage.garbage");
  check("A6 garbage token rejected by data route", badLoad.status === 401);

  // 3. cross-user isolation via a real data route
  const aTok = String(sa.data.access);
  const bTok = String(sb.data.access);
  const aUser = (sa.data.user as { id: string }).id;
  const bUser = (sb.data.user as { id: string }).id;
  check("A7 distinct user ids", aUser !== bUser && aUser.length > 10);
  // seed a thread for A directly, then load as B
  await surrealQuery(`CREATE thread:\`tw-thread-a\` SET user_id = ${str(aUser)}, name = "tripwire A thread", messages = [];`);
  const asA = await transcripts(aTok);
  const asB = await transcripts(bTok);
  check("A8 A sees own thread", (asA.data.sessions ?? []).some((s) => s.id === "tw-thread-a"));
  check("A9 B cannot see A's thread", !(asB.data.sessions ?? []).some((s) => s.id === "tw-thread-a"));

  // 4. refresh rotation
  const r1 = await auth({ action: "refresh", refresh: sa.data.refresh });
  check("A10 refresh yields new tokens", r1.status === 200 && !!r1.data.access && !!r1.data.refresh);
  const r2 = await auth({ action: "refresh", refresh: sa.data.refresh });
  check("A11 old refresh rejected after rotation", r2.status === 401);

  // 5. legacy bcrypt import -> lazy argon2 upgrade
  const [h] = await surrealQuery<string>(`RETURN crypto::bcrypt::generate("legacy-pass-1");`);
  await surrealQuery(`UPDATE user SET pass = "!", legacy_bcrypt = ${str(h)} WHERE email = ${str(B.email)};`);
  const legacy = await auth({ action: "signin", email: B.email, pass: "legacy-pass-1" });
  check("A12 signin via imported bcrypt hash", legacy.status === 200);
  const [after] = await surrealQuery<Array<{ legacy_bcrypt?: string | null }>>(`SELECT legacy_bcrypt FROM user WHERE email = ${str(B.email)};`);
  check("A13 legacy hash cleared after upgrade (argon2 now)", !after?.[0]?.legacy_bcrypt);
  const again = await auth({ action: "signin", email: B.email, pass: "legacy-pass-1" });
  check("A14 signin still works after upgrade", again.status === 200);

  // 6. rate limit trips (11th wrong attempt on same email)
  let last = 0;
  for (let i = 0; i < 11; i++) { last = (await auth({ action: "signin", email: "ratelimit@example.invalid", pass: "x" })).status; }
  check("A15 rate limit trips after 10 attempts", last === 429, `last=${last}`);

  // cleanup
  await surrealQuery(`DELETE thread:\`tw-thread-a\`; DELETE user WHERE email IN [${str(A.email)}, ${str(B.email)}];`);
  console.log("=============================");
  if (fails) { console.log(`AUTH TRIPWIRES: ${fails} FAILED — DO NOT SHIP.`); process.exit(1); }
  console.log("AUTH TRIPWIRES: ALL 15 PASSED — the front door holds. 🛡️");
}
main().catch((e) => { console.error("tripwire crashed:", e); process.exit(1); });
