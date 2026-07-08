// lib/embedding.ts — text -> 1536-dim vector via OpenRouter Qwen3-Embedding-8B.
// Mirrors the engine's provider (Matryoshka truncation to 1536). Plain fetch,
// no npm dependency. Returns null on failure — callers treat embedding as an
// index, never a source of truth.
import { secret } from "./secrets";

const EMBED_MODEL = "qwen/qwen3-embedding-8b";
export const EMBED_DIM = 1536;
const CHAR_CAP = 8000;

export async function embed(text: string): Promise<number[] | null> {
  try {
    const key = secret("OPENROUTER_API_KEY");
    const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: text.slice(0, CHAR_CAP),
        dimensions: EMBED_DIM,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.warn(`[embed] OpenRouter ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const vec = data.data?.[0]?.embedding ?? null;
    return vec && vec.length === EMBED_DIM ? vec : null;
  } catch (e) {
    console.warn(`[embed] failed: ${(e as Error).message}`);
    return null;
  }
}

/** Embed several texts, batches of 5, result aligned with input. */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  const out: (number[] | null)[] = [];
  for (let i = 0; i < texts.length; i += 5) {
    const batch = await Promise.all(texts.slice(i, i + 5).map((t) => embed(t)));
    out.push(...batch);
  }
  return out;
}
