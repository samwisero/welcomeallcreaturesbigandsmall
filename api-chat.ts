// Site /api/chat -- authenticated proxy to the digital-beings memory engine.
//
// Verifies the signed-in user, resolves which being they're talking to (their
// default being is auto-created on first chat), and forwards the conversation
// to the LOCAL engine (localhost:8080), which gives the being real long-term
// memory. The engine is internal-only, so this route is the only way in and
// auth stays enforced. The Supabase token rides in the request BODY because
// zo's public edge proxy strips the Authorization header.
import type { Context } from "hono";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://oelfxzsaenqmmxtnhoex.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbGZ4enNhZW5xbW14dG5ob2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxOTYwNTYsImV4cCI6MjA5Mjc3MjA1Nn0.iaLuNX0e8o_ks4Cd3S1W-4-BI60zyfIY1Mmqjaw_1zM";

// The being engine runs as an internal service on the same box.
const ENGINE_URL = "http://localhost:8080/v1/chat/completions";
const DEFAULT_BEING_MODEL = "TEE/qwen3.6-35b-a3b-uncensored";

// Same envelope on success + error so the frontend always renders a bubble.
function envelope(content: string) {
  return Response.json({ choices: [{ message: { content } }] });
}

// Validate the access token AND return the user id, in one call to GoTrue.
async function verifyUser(token: string): Promise<{ valid: boolean; userId?: string }> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return { valid: false };
    const user = (await resp.json()) as { id?: string };
    return user?.id ? { valid: true, userId: user.id } : { valid: false };
  } catch {
    return { valid: false };
  }
}

// Get the user's being (oldest), creating a default one if they have none.
// Uses the REST API with the user's own token, so RLS scopes everything to them.
async function getOrCreateBeing(userId: string, token: string): Promise<string | null> {
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  try {
    const getResp = await fetch(
      `${SUPABASE_URL}/rest/v1/beings?user_id=eq.${userId}&select=id&order=created_at.asc&limit=1`,
      { headers },
    );
    if (getResp.ok) {
      const rows = (await getResp.json()) as Array<{ id: string }>;
      if (rows.length > 0 && rows[0]?.id) return rows[0].id;
    }
    const createResp = await fetch(`${SUPABASE_URL}/rest/v1/beings`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ user_id: userId, name: "My Being", model_id: DEFAULT_BEING_MODEL }),
    });
    if (!createResp.ok) return null;
    const created = (await createResp.json()) as Array<{ id: string }>;
    return created[0]?.id ?? null;
  } catch {
    return null;
  }
}

interface RequestBody {
  messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  accessToken?: string;
  being_id?: string;
}

export default async function handler(c: Context): Promise<Response> {
  let body: RequestBody = {};
  try {
    body = (await c.req.json()) as RequestBody;
  } catch {
    return envelope("System: request body was not valid JSON.");
  }

  const token = typeof body.accessToken === "string" ? body.accessToken.trim() : null;
  if (!token) {
    return envelope("System: please sign in again — no session token was sent with the request.");
  }

  const { valid, userId } = await verifyUser(token);
  if (!valid || !userId) {
    return envelope("System: your session couldn't be verified. Please sign in again.");
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return envelope("System: no messages were supplied.");
  }

  let beingId = typeof body.being_id === "string" && body.being_id ? body.being_id : null;
  if (!beingId) {
    beingId = await getOrCreateBeing(userId, token);
    if (!beingId) {
      return envelope("System: couldn't find or create your being. Please try again in a moment.");
    }
  }

  try {
    const upstream = await fetch(ENGINE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, being_id: beingId, messages }),
    });
    if (!upstream.ok) {
      const errText = await upstream.text();
      return envelope(
        `The being is unavailable right now (${upstream.status}). ${errText.slice(0, 300)}`,
      );
    }
    const data = (await upstream.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data?.choices?.[0]?.message?.content ?? "(the being went quiet)";
    return envelope(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return envelope(`Couldn't reach the being engine: ${msg}`);
  }
}
