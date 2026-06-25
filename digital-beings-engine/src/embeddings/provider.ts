/**
 * openai.ts  --  Embedding client.
 *
 * Single-purpose: text -> vector (or null on failure).
 *
 * We use OpenRouter as the embedding provider, not OpenAI directly.  This
 * keeps all model access behind one bill and one key, and gives us the
 * freedom to swap embedders without touching the rest of the code.
 *
 * The active model is Qwen/Qwen3-Embedding-8B, truncated to EMBED_DIM via
 * Matryoshka representation learning.
 *
 * The file is named "openai.ts" for legacy reasons -- it's actually
 * OpenRouter.  TODO: rename to provider.ts.
 */

import OpenAI from "openai";
import {
  EMBED_MODEL,
  EMBED_INPUT_CHAR_CAP,
  EMBED_DIM,
  OPENROUTER_API_KEY,
  OPENROUTER_BASE_URL,
} from "../config.ts";

let _client: OpenAI | null = null;

const getClient = (): OpenAI => {
  if (_client === null) {
    _client = new OpenAI({
      apiKey: OPENROUTER_API_KEY,
      baseURL: OPENROUTER_BASE_URL,
    });
  }
  return _client;
};

export const embed = async (text: string): Promise<number[] | null> => {
  try {
    const capped = text.slice(0, EMBED_INPUT_CHAR_CAP);
    const resp = await getClient().embeddings.create({
      model: EMBED_MODEL,
      input: capped,
      dimensions: EMBED_DIM,
    });
    const vec = resp.data[0]?.embedding;
    return vec ?? null;
  } catch (e) {
    console.error(`[embed] failed: ${(e as Error).message}`);
    return null;
  }
};
