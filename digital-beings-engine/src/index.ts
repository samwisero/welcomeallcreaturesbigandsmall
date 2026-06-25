/**
 * index.ts -- entrypoint. Validates env + schema, starts the HTTP server.
 *
 * POST /v1/chat/completions  (OpenAI-shape, multi-tenant):
 *   body = { messages: [...], model?: string, user_id: string, being_id: string }
 * The trusted caller (the site's /api/chat proxy) authenticates the user and
 * passes user_id + being_id; we bind them as the request's tenant context so
 * every memory query is scoped to the right being.
 */
import { Hono } from "hono";
import { runAgentTurn } from "./agent.ts";
import { MAX_REQUEST_BODY_BYTES, SERVER_PORT } from "./config.ts";
import { closePool, verifyPgvector } from "./db/client.ts";
import { runMigrations, logTableCounts } from "./db/migrations.ts";
import { checkRate, clientIp } from "./rateLimit.ts";
import { runWithContext } from "./context.ts";
import type { ChatMessage } from "./types.ts";

const app = new Hono();

app.post("/v1/chat/completions", async (c) => {
  const ip = clientIp(c.req.raw, c.req.raw.headers.get("x-real-ip") ?? "anon");
  const rl = checkRate(ip);
  if (!rl.ok) {
    return c.json({ error: { type: "rate_limited", retry_after_seconds: rl.resetIn } }, 429);
  }

  const contentLength = Number(c.req.header("content-length") ?? "0");
  if (contentLength > MAX_REQUEST_BODY_BYTES) {
    return c.json({ error: { type: "payload_too_large", max_bytes: MAX_REQUEST_BODY_BYTES } }, 413);
  }

  let body: { messages?: ChatMessage[]; model?: string; user_id?: string; being_id?: string };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: { type: "invalid_json" } }, 400);
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    return c.json({ error: { type: "missing_or_invalid_messages" } }, 400);
  }
  if (!body.user_id || !body.being_id) {
    return c.json(
      { error: { type: "missing_tenant", message: "user_id and being_id are required" } },
      400
    );
  }

  try {
    const result = await runWithContext({ userId: body.user_id, beingId: body.being_id }, () =>
      runAgentTurn(body.messages!, body.model)
    );
    return c.json(result);
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`[fatal] ${msg}`);
    return c.json({ error: { type: "internal", message: `CRASH LOG: ${msg}` } }, 500);
  }
});

app.get("/healthz", (c) => c.json({ ok: true }));

const main = async (): Promise<void> => {
  console.log("[engine] verifying pgvector...");
  await verifyPgvector();
  console.log("[engine] checking schema...");
  await runMigrations();
  await logTableCounts();

  const server = Bun.serve({ port: SERVER_PORT, fetch: app.fetch });
  console.log(`[engine] listening on ${server.url}`);

  const shutdown = async (): Promise<void> => {
    console.log("[engine] shutting down...");
    server.stop();
    await closePool();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

main().catch((e: unknown) => {
  console.error(`[engine] startup failed: ${(e as Error).message}`);
  process.exit(1);
});
